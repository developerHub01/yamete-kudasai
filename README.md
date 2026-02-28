# Yamete Kudasai Error Monitor 🎀

A professional and highly reactive VS Code extension that monitors your project for errors and provides... iconic anime feedback.

## Features

- **Hyper-Consistent Monitoring**: Tracks diagnostics (syntax/linting) in every file individually.
- **Terminal Integration**: Listens for failed shell executions (non-zero exit codes).
- **Dynamic Soundboard**: Loads all audio files from `assets/audio/` automatically.
- **Weighted Selection**: 50% chance to hear the classic `yamete.mp3`, ensuring the vibe is always right.
- **UI Feedback**: Status bar heart icon turns red and shows a warning on triggers.
- **Customizable**: Full control over volume and monitoring channels.

## How it Works

1. When you introduce a new error in your code, the extension detects the increase in diagnostic count.
2. It picks a random audio file from your collection and plays it using native OS commands.
3. The status bar reflects the change instantly.

## Usage

- **Testing**: Run the command `Yamete Kudasai: Test Audio` or click the heart icon.
- **Settings**: Search for `Yamete` in VS Code settings to toggle features.

---

_Created with love for a better debugging experience._
