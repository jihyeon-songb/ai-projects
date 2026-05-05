import json
import shutil
import subprocess
import sys

MAX_SUBTITLE_LENGTH = 120

NOTIFICATION_TITLES = {
    "agent-turn-complete": ("🔔", "Codex Update"),
    "agent-turn-start": ("🚀", "Codex Working"),
    "agent-error": ("⚠️", "Codex Alert"),
    "approval-requested": ("🛂", "Codex Needs Approval"),
    "input-requested": ("💬", "Codex Needs Input"),
}

MESSAGE_EMOJI_RULES = [
    (("오류", "에러", "실패", "failed", "error"), "⚠️"),
    (("수정", "변경", "업데이트", "고쳤", "적용"), "🛠️"),
    (("완료", "통과", "성공", "done", "pass"), "✅"),
    (("검증", "테스트", "빌드", "compile"), "🧪"),
    (("배포", "deploy"), "🚀"),
    (("질문", "확인", "입력", "승인"), "❓"),
]


def compact_text(text: str, limit: int) -> str:
    compacted = " ".join(text.split())
    if len(compacted) <= limit:
        return compacted
    return compacted[: limit - 3].rstrip() + "..."


def response_emoji(last_assistant_message: str):
    text = last_assistant_message.lower()
    for keywords, emoji in MESSAGE_EMOJI_RULES:
        if any(keyword in text for keyword in keywords):
            return emoji
    return None


def format_notification_title(notification_type: str, last_assistant_message: str) -> str:
    emojis, label = NOTIFICATION_TITLES.get(notification_type, ("🔔", "Codex Notice"))
    emojis = response_emoji(last_assistant_message) or emojis
    return f"{emojis} {label}"


def format_notification_subtitle(last_assistant_message: str) -> str:
    return compact_text(last_assistant_message, MAX_SUBTITLE_LENGTH)


def format_notification_message(input_messages: list[str]) -> str:
    message = input_messages[-1].strip() if input_messages else ""
    if not message:
        message = "Codex 작업이 완료됐습니다."
    return message


def notify(title: str, subtitle: str, message: str, group: str) -> bool:
    terminal_notifier = shutil.which("terminal-notifier")
    if terminal_notifier:
        command = [
            terminal_notifier,
            "-title",
            title,
            "-message",
            message,
            "-group",
            group,
            "-activate",
            "com.googlecode.iterm2",
        ]
        if subtitle:
            command.extend(["-subtitle", subtitle])
        subprocess.run(command, check=True)
        return True

    osascript = shutil.which("osascript")
    if osascript:
        script = "display notification (item 3 of argv) with title (item 1 of argv)"
        if subtitle:
            script += " subtitle (item 2 of argv)"
        subprocess.run(
            [osascript, "-e", "on run argv", "-e", script, "-e", "end run", title, subtitle, message],
            check=True,
        )
        return True

    return False


def main() -> int:
    notification = json.loads(sys.argv[1])
    notification_type = notification.get("type")
    if notification_type != "agent-turn-complete":
        return 0
    last_assistant_message = notification.get("last-assistant-message", "")
    title = format_notification_title(notification_type, last_assistant_message)
    subtitle = format_notification_subtitle(last_assistant_message)
    message = format_notification_message(notification.get("input-messages", []))

    try:
        if not notify(title, subtitle, message, "codex-" + notification.get("thread-id", "")):
            print("No macOS notification command found.", file=sys.stderr)
    except subprocess.CalledProcessError as exc:
        print(f"Notification command failed: {exc}", file=sys.stderr)

    return 0

if __name__ == "__main__":
    sys.exit(main())
