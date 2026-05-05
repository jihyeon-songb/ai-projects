use crate::codex::{
    format_datetime, load_session_detail, load_sessions, AppConfig, ConversationMessage,
    MessageRole, SessionDetail, SessionSummary,
};
use eframe::egui::{self, Color32, RichText, ScrollArea, TextEdit, Ui};
use std::path::PathBuf;

pub struct SessionManagerApp {
    config: AppConfig,
    sessions: Vec<SessionSummary>,
    selected: usize,
    detail: Option<SessionDetail>,
    search: String,
    status: String,
    loaded_korean_font: Option<PathBuf>,
}

impl SessionManagerApp {
    pub fn new(config: AppConfig, loaded_korean_font: Option<PathBuf>) -> Self {
        let mut app = Self {
            config,
            sessions: Vec::new(),
            selected: 0,
            detail: None,
            search: String::new(),
            status: String::new(),
            loaded_korean_font,
        };
        app.reload();
        app
    }

    fn reload(&mut self) {
        match load_sessions(&self.config) {
            Ok(sessions) => {
                self.sessions = sessions;
                self.selected = self.selected.min(self.sessions.len().saturating_sub(1));
                self.status = format!(
                    "{} sessions loaded{}",
                    self.sessions.len(),
                    self.font_status_suffix()
                );
                self.open_selected();
            }
            Err(err) => {
                self.sessions.clear();
                self.detail = None;
                self.status = format!("Load failed: {err}");
            }
        }
    }

    fn open_selected(&mut self) {
        let Some(summary) = self.filtered_sessions().get(self.selected).cloned() else {
            self.detail = None;
            return;
        };

        match load_session_detail(&summary) {
            Ok(detail) => {
                self.detail = Some(detail);
                self.status = format!("Session opened{}", self.font_status_suffix());
            }
            Err(err) => {
                self.status = format!("Open failed: {err}");
            }
        }
    }

    fn filtered_sessions(&self) -> Vec<SessionSummary> {
        let query = self.search.trim().to_lowercase();
        if query.is_empty() {
            return self.sessions.clone();
        }

        self.sessions
            .iter()
            .filter(|session| {
                session.title.to_lowercase().contains(&query)
                    || session.id.to_lowercase().contains(&query)
                    || session.preview.to_lowercase().contains(&query)
            })
            .cloned()
            .collect()
    }

    fn handle_keyboard(&mut self, ctx: &egui::Context) {
        let filtered_len = self.filtered_sessions().len();
        if filtered_len == 0 {
            self.selected = 0;
            return;
        }

        let mut changed = false;
        ctx.input(|input| {
            if input.key_pressed(egui::Key::ArrowDown) {
                self.selected = (self.selected + 1).min(filtered_len - 1);
                changed = true;
            }
            if input.key_pressed(egui::Key::ArrowUp) {
                self.selected = self.selected.saturating_sub(1);
                changed = true;
            }
            if input.key_pressed(egui::Key::Enter) {
                changed = true;
            }
        });

        if changed {
            self.open_selected();
        }
    }
}

impl eframe::App for SessionManagerApp {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.handle_keyboard(&ctx);

        egui::Panel::top("toolbar").show_inside(ui, |ui| {
            ui.horizontal(|ui| {
                ui.heading("Codex Session Manager");
                ui.separator();
                if ui.button("Reload").clicked() {
                    self.reload();
                }
                ui.label(format!("Codex home: {}", self.config.codex_home.display()));
            });
            ui.add_space(6.0);
            let response = ui.add(
                TextEdit::singleline(&mut self.search)
                    .hint_text("Search sessions, ids, and previews")
                    .desired_width(f32::INFINITY),
            );
            if response.changed() {
                self.selected = 0;
                self.open_selected();
            }
        });

        egui::Panel::bottom("status").show_inside(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(&self.status);
                ui.separator();
                ui.label("Up/Down moves selection. Enter opens the selected session.");
            });
        });

        egui::Panel::left("sessions")
            .resizable(true)
            .default_size(390.0)
            .size_range(280.0..=560.0)
            .show_inside(ui, |ui| {
                let filtered = self.filtered_sessions();
                ui.horizontal(|ui| {
                    ui.strong("Sessions");
                    ui.label(format!("{} shown", filtered.len()));
                });
                ui.add_space(4.0);

                ScrollArea::vertical().show(ui, |ui| {
                    for (index, session) in filtered.iter().enumerate() {
                        let selected = index == self.selected;
                        let frame = egui::Frame::NONE
                            .fill(if selected {
                                Color32::from_rgb(34, 76, 124)
                            } else {
                                Color32::TRANSPARENT
                            })
                            .inner_margin(egui::Margin::same(8));

                        let response = frame
                            .show(ui, |ui| session_row(ui, session, selected))
                            .response
                            .interact(egui::Sense::click());

                        if response.clicked() {
                            self.selected = index;
                            self.open_selected();
                        }
                        ui.add_space(3.0);
                    }
                });
            });

        egui::CentralPanel::default().show_inside(ui, |ui| {
            if let Some(detail) = &self.detail {
                detail_view(ui, detail);
            } else {
                ui.centered_and_justified(|ui| {
                    ui.label("No session selected");
                });
            }
        });
    }
}

impl SessionManagerApp {
    fn font_status_suffix(&self) -> String {
        match &self.loaded_korean_font {
            Some(path) => path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| format!(" | Korean font: {name}"))
                .unwrap_or_else(|| " | Korean font loaded".to_string()),
            None => " | Korean font not found".to_string(),
        }
    }
}

fn session_row(ui: &mut Ui, session: &SessionSummary, selected: bool) {
    let title_color = if selected {
        Color32::WHITE
    } else {
        ui.visuals().text_color()
    };
    let muted = if selected {
        Color32::from_rgb(210, 225, 242)
    } else {
        Color32::from_gray(130)
    };

    ui.vertical(|ui| {
        ui.label(RichText::new(&session.title).strong().color(title_color));
        ui.horizontal(|ui| {
            ui.label(RichText::new(format_datetime(session.updated_at.as_ref())).color(muted));
            ui.label(RichText::new(format!("{} messages", session.message_count)).color(muted));
        });
        if !session.preview.is_empty() {
            ui.add(egui::Label::new(RichText::new(&session.preview).small().color(muted)).wrap());
        }
    });
}

fn detail_view(ui: &mut Ui, detail: &SessionDetail) {
    ui.horizontal(|ui| {
        ui.heading(&detail.summary.title);
        ui.separator();
        ui.label(format_datetime(detail.summary.updated_at.as_ref()));
    });
    ui.label(RichText::new(detail.summary.path.display().to_string()).small().monospace());
    ui.add_space(8.0);

    ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        for message in &detail.messages {
            message_view(ui, message);
            ui.add_space(8.0);
        }
    });
}

fn message_view(ui: &mut Ui, message: &ConversationMessage) {
    let (label, color) = match message.role {
        MessageRole::User => ("User", Color32::from_rgb(57, 108, 196)),
        MessageRole::Assistant => ("Assistant", Color32::from_rgb(34, 132, 96)),
        MessageRole::Tool => ("Tool", Color32::from_rgb(128, 92, 180)),
        MessageRole::System => ("System", Color32::from_rgb(120, 120, 120)),
        MessageRole::Event => ("Event", Color32::from_rgb(150, 105, 60)),
    };

    egui::Frame::group(ui.style())
        .inner_margin(egui::Margin::same(10))
        .show(ui, |ui| {
            ui.label(RichText::new(label).strong().color(color));
            ui.add_space(4.0);
            ui.add(egui::Label::new(&message.text).wrap());
        });
}
