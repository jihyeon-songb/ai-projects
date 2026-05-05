use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Local, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub codex_home: PathBuf,
    pub sessions_dir: PathBuf,
    pub index_path: PathBuf,
}

impl AppConfig {
    pub fn from_args<I>(args: I) -> Result<Option<Self>>
    where
        I: IntoIterator<Item = String>,
    {
        let mut codex_home = default_codex_home()?;
        let mut sessions_dir: Option<PathBuf> = None;
        let mut index_path: Option<PathBuf> = None;

        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--codex-home" => {
                    codex_home = next_path(&mut args, "--codex-home")?;
                }
                "--sessions-dir" => {
                    sessions_dir = Some(next_path(&mut args, "--sessions-dir")?);
                }
                "--index" => {
                    index_path = Some(next_path(&mut args, "--index")?);
                }
                "--help" | "-h" => {
                    println!("{}", usage());
                    return Ok(None);
                }
                other => return Err(anyhow!("unknown argument: {other}")),
            }
        }

        Ok(Some(Self {
            sessions_dir: sessions_dir.unwrap_or_else(|| codex_home.join("sessions")),
            index_path: index_path.unwrap_or_else(|| codex_home.join("session_index.jsonl")),
            codex_home,
        }))
    }
}

pub fn usage() -> &'static str {
    "Usage: codex-session-manager [--codex-home PATH] [--sessions-dir PATH] [--index PATH]"
}

#[derive(Debug, Clone)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub updated_at: Option<DateTime<Utc>>,
    pub path: PathBuf,
    pub message_count: usize,
    pub preview: String,
}

#[derive(Debug, Clone)]
pub struct ConversationMessage {
    pub role: MessageRole,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageRole {
    User,
    Assistant,
    Tool,
    System,
    Event,
}

#[derive(Debug, Clone)]
pub struct SessionDetail {
    pub summary: SessionSummary,
    pub messages: Vec<ConversationMessage>,
}

#[derive(Debug, Deserialize)]
struct IndexRecord {
    id: String,
    thread_name: Option<String>,
    updated_at: Option<DateTime<Utc>>,
}

pub fn load_sessions(config: &AppConfig) -> Result<Vec<SessionSummary>> {
    let index = read_index(&config.index_path).unwrap_or_default();
    let mut sessions = Vec::new();

    if !config.sessions_dir.exists() {
        return Ok(sessions);
    }

    for entry in WalkDir::new(&config.sessions_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
            continue;
        }

        let id = session_id_from_path(path);
        let Some(id) = id else {
            continue;
        };

        let parsed = parse_session_file(path, 8).unwrap_or_default();
        let index_record = index.get(&id);
        let title = index_record
            .and_then(|record| record.thread_name.clone())
            .or_else(|| parsed.title.clone())
            .unwrap_or_else(|| "Untitled session".to_string());
        let updated_at = index_record
            .and_then(|record| record.updated_at.clone())
            .or(parsed.updated_at);
        let preview = parsed
            .messages
            .iter()
            .take(3)
            .map(|message| compact_text(&message.text, 140))
            .collect::<Vec<_>>()
            .join("\n");

        sessions.push(SessionSummary {
            id,
            title,
            updated_at,
            path: path.to_path_buf(),
            message_count: parsed.message_count,
            preview,
        });
    }

    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| b.path.cmp(&a.path)));
    Ok(sessions)
}

pub fn load_session_detail(summary: &SessionSummary) -> Result<SessionDetail> {
    let parsed = parse_session_file(&summary.path, usize::MAX)
        .with_context(|| format!("failed to parse {}", summary.path.display()))?;
    Ok(SessionDetail {
        summary: summary.clone(),
        messages: parsed.messages,
    })
}

pub fn format_datetime(value: Option<&DateTime<Utc>>) -> String {
    value
        .map(|dt| {
            dt.with_timezone(&Local)
                .format("%Y-%m-%d %H:%M")
                .to_string()
        })
        .unwrap_or_else(|| "-".to_string())
}

fn read_index(path: &Path) -> Result<HashMap<String, IndexRecord>> {
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut records = HashMap::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(record) = serde_json::from_str::<IndexRecord>(&line) {
            records.insert(record.id.clone(), record);
        }
    }

    Ok(records)
}

#[derive(Default)]
struct ParsedSession {
    title: Option<String>,
    updated_at: Option<DateTime<Utc>>,
    message_count: usize,
    messages: Vec<ConversationMessage>,
}

fn parse_session_file(path: &Path, message_limit: usize) -> Result<ParsedSession> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut parsed = ParsedSession::default();
    let mut seen_messages = HashSet::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if let Some(timestamp) = value
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
            .map(|dt| dt.with_timezone(&Utc))
        {
            parsed.updated_at = Some(timestamp);
        }

        let record_type = value.get("type").and_then(Value::as_str).unwrap_or_default();
        let payload = value.get("payload").unwrap_or(&Value::Null);

        if record_type == "session_meta" {
            parsed.title = parsed.title.or_else(|| {
                payload
                    .get("cwd")
                    .and_then(Value::as_str)
                    .and_then(|cwd| Path::new(cwd).file_name())
                    .and_then(|name| name.to_str())
                    .map(ToOwned::to_owned)
            });
            continue;
        }

        if record_type == "event_msg" {
            if payload.get("type").and_then(Value::as_str) == Some("thread_name_updated") {
                parsed.title = payload
                    .get("thread_name")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or(parsed.title);
            }
            if let Some(message) = event_message(payload) {
                push_message(&mut parsed, &mut seen_messages, message, message_limit);
            }
            continue;
        }

        if record_type == "response_item" {
            if let Some(message) = response_item_message(payload) {
                push_message(&mut parsed, &mut seen_messages, message, message_limit);
            }
        }
    }

    Ok(parsed)
}

fn push_message(
    parsed: &mut ParsedSession,
    seen_messages: &mut HashSet<String>,
    message: ConversationMessage,
    message_limit: usize,
) {
    let key = format!("{:?}:{}", message.role, message.text.trim());
    if !seen_messages.insert(key) {
        return;
    }

    parsed.message_count += 1;
    if parsed.messages.len() < message_limit {
        parsed.messages.push(message);
    }
}

fn event_message(payload: &Value) -> Option<ConversationMessage> {
    match payload.get("type").and_then(Value::as_str)? {
        "user_message" => payload
            .get("message")
            .and_then(Value::as_str)
            .map(|text| ConversationMessage {
                role: MessageRole::User,
                text: text.to_string(),
            }),
        "agent_message" => payload
            .get("message")
            .and_then(Value::as_str)
            .map(|text| ConversationMessage {
                role: MessageRole::Assistant,
                text: text.to_string(),
            }),
        _ => None,
    }
}

fn response_item_message(payload: &Value) -> Option<ConversationMessage> {
    let item_type = payload.get("type").and_then(Value::as_str)?;
    match item_type {
        "message" => {
            let role = match payload.get("role").and_then(Value::as_str) {
                Some("user") => MessageRole::User,
                Some("assistant") => MessageRole::Assistant,
                Some("system") => MessageRole::System,
                _ => MessageRole::Event,
            };
            content_text(payload.get("content")?).map(|text| ConversationMessage { role, text })
        }
        "function_call" | "function_call_output" => Some(ConversationMessage {
            role: MessageRole::Tool,
            text: compact_json(payload),
        }),
        _ => None,
    }
}

fn content_text(content: &Value) -> Option<String> {
    let array = content.as_array()?;
    let parts = array
        .iter()
        .filter_map(|part| {
            part.get("text")
                .or_else(|| part.get("input_text"))
                .or_else(|| part.get("output_text"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

fn compact_json(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn compact_text(value: &str, max_chars: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }

    let mut result = normalized.chars().take(max_chars.saturating_sub(1)).collect::<String>();
    result.push_str("...");
    result
}

fn session_id_from_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    let id = stem
        .char_indices()
        .rev()
        .nth(35)
        .and_then(|(index, _)| stem.get(index..))?;

    if is_uuid_like(id) {
        Some(id.to_string())
    } else {
        None
    }
}

fn is_uuid_like(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
        && bytes.iter().enumerate().all(|(index, byte)| {
            [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit()
        })
}

fn next_path(args: &mut impl Iterator<Item = String>, name: &str) -> Result<PathBuf> {
    args.next()
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("{name} requires a path"))
}

fn default_codex_home() -> Result<PathBuf> {
    if let Ok(value) = std::env::var("CODEX_HOME") {
        return Ok(PathBuf::from(value));
    }

    if cfg!(windows) {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return Ok(PathBuf::from(profile).join(".codex"));
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            return Ok(PathBuf::from(appdata).join("Codex"));
        }
    }

    std::env::var("HOME")
        .map(|home| PathBuf::from(home).join(".codex"))
        .map_err(|_| anyhow!("could not locate Codex home; set CODEX_HOME or pass --codex-home"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_session_id_from_rollout_filename() {
        let path = Path::new(
            "rollout-2026-04-28T15-26-18-019dd2c4-5ef8-76c0-916f-dc73c0356412.jsonl",
        );
        assert_eq!(
            session_id_from_path(path).as_deref(),
            Some("019dd2c4-5ef8-76c0-916f-dc73c0356412")
        );
    }

    #[test]
    fn extracts_text_from_response_content() {
        let value: Value = serde_json::json!([
            {"type": "output_text", "text": "hello"},
            {"type": "output_text", "text": "world"}
        ]);
        assert_eq!(content_text(&value).as_deref(), Some("hello\n\nworld"));
    }
}
