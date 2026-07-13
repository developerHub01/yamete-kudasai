import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";

let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let audioFiles: string[] = [];
let lastPlayTime = 0;
const COOLDOWN_MS = 3000; // 3 seconds cooldown between audio plays

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Yamete Kudasai Monitor");
  outputChannel.appendLine("Yamete Kudasai Monitor is now active!");

  // Load audio files dynamically
  refreshAudioFiles(context);

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = `$(heart) Yamete Active`;
  statusBarItem.tooltip = "Click to test or right-click for settings";
  statusBarItem.command = "yameteKudasai.testAudio";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Command: Test Audio
  context.subscriptions.push(
    vscode.commands.registerCommand("yameteKudasai.testAudio", () => {
      outputChannel.appendLine("Manual test triggered.");
      playYamete(context, false);
      vscode.window.showInformationMessage("Yamete Kudasai! Audio tested.");
    }),
  );

  // Command: Open Settings
  context.subscriptions.push(
    vscode.commands.registerCommand("yameteKudasai.openSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "Yamete Kudasai",
      );
    }),
  );

  // Command: Refresh Audio List
  context.subscriptions.push(
    vscode.commands.registerCommand("yameteKudasai.refreshAudio", () => {
      refreshAudioFiles(context);
      vscode.window.showInformationMessage(
        `Loaded ${audioFiles.length} audio files.`,
      );
    }),
  );

  // Command: Open audio selector webview
  context.subscriptions.push(
    vscode.commands.registerCommand("yameteKudasai.openAudioSelector", () => {
      openAudioSelector(context);
    }),
  );

  // Command: Preview / Select Audio
  context.subscriptions.push(
    vscode.commands.registerCommand("yameteKudasai.previewAudio", async () => {
      refreshAudioFiles(context);
      const config = vscode.workspace.getConfiguration("yameteKudasai");
      const preferred = config.get<string>("preferredAudio", "");

      const quickItems = audioFiles.map((f) => ({ label: f }));
      quickItems.unshift({ label: "Choose local file..." });

      const pick = await vscode.window.showQuickPick(quickItems, {
        placeHolder: preferred || "Select an audio to preview and optionally set as preferred",
      });
      if (!pick) return;

      if (pick.label === "Choose local file...") {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: "Select audio file",
          filters: { Audio: ["mp3", "wav", "ogg"] },
        });
        if (!uris || uris.length === 0) return;
        const filePath = uris[0].fsPath;
        playAudioAtPath(filePath);
        const set = "Set as preferred";
        const dont = "Don't set";
        const choice = await vscode.window.showInformationMessage(
          `Previewing ${filePath}`,
          set,
          dont,
        );
        if (choice === set) {
          await config.update("customAudioPath", filePath, vscode.ConfigurationTarget.Global);
          await config.update("preferredAudio", filePath, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage("Preferred audio set to local file.");
        }
      } else {
        // selected bundled audio
        const selected = path.join(context.extensionPath, "assets", "audio", pick.label);
        playAudioAtPath(selected);
        const set = "Set as preferred";
        const dont = "Don't set";
        const choice = await vscode.window.showInformationMessage(
          `Previewing ${pick.label}`,
          set,
          dont,
        );
        if (choice === set) {
          await config.update("preferredAudio", pick.label, vscode.ConfigurationTarget.Global);
          // clear custom path if any
          await config.update("customAudioPath", "", vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage("Preferred audio set.");
        }
      }
    }),
  );

  // Command: Set Preferred Audio directly (opens quickpick)
  context.subscriptions.push(
    vscode.commands.registerCommand("yameteKudasai.setPreferredAudio", async () => {
      vscode.commands.executeCommand("yameteKudasai.previewAudio");
    }),
  );

  const errorTracker = new Map<string, number>();

  // Helper to check errors on a specific URI
  function checkDiagnostics(uri: vscode.Uri) {
    const config = vscode.workspace.getConfiguration("yameteKudasai");
    if (!config.get("monitorCodeErrors")) return;

    const uriStr = uri.toString();
    const diagnostics = vscode.languages.getDiagnostics(uri);
    const currentCount = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error,
    ).length;
    const previousCount = errorTracker.get(uriStr) || 0;

    if (currentCount > previousCount) {
      outputChannel.appendLine(
        `[${path.basename(uri.fsPath)}] New error detected! (${previousCount} -> ${currentCount})`,
      );
      triggerEffect();
      playYamete(context);
    }
    errorTracker.set(uriStr, currentCount);
  }

  // 1. Monitor Codebase Errors (Hyper-consistent per-file tracking)
  const diagnosticListener = vscode.languages.onDidChangeDiagnostics(
    (event) => {
      event.uris.forEach((uri) => checkDiagnostics(uri));
    },
  );

  // Extra consistency: check errors when switching or saving files
  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) checkDiagnostics(editor.document.uri);
    },
  );

  const docSaveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
    checkDiagnostics(doc.uri);
  });

  // 2. Monitor Terminal Errors
  const win = vscode.window as any;
  if (win.onDidEndTerminalShellExecution) {
    context.subscriptions.push(
      win.onDidEndTerminalShellExecution((event: any) => {
        const config = vscode.workspace.getConfiguration("yameteKudasai");
        if (!config.get("monitorTerminalErrors")) return;

        if (event.exitCode !== undefined && event.exitCode !== 0) {
          outputChannel.appendLine(
            `Terminal failed with code: ${event.exitCode}`,
          );
          triggerEffect();
          playYamete(context);
        }
      }),
    );
  }

  function triggerEffect() {
    statusBarItem.text = `$(warning) Yamete!!`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    setTimeout(() => {
      statusBarItem.text = `$(heart) Yamete Active`;
      statusBarItem.backgroundColor = undefined;
    }, 3000);
  }

  context.subscriptions.push(
    diagnosticListener,
    activeEditorListener,
    docSaveListener,
  );
}

function refreshAudioFiles(context: vscode.ExtensionContext) {
  const audioDir = path.join(context.extensionPath, "assets", "audio");
  try {
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    audioFiles = fs
      .readdirSync(audioDir)
      .filter((file: string) => file.endsWith(".mp3") || file.endsWith(".wav"));
    outputChannel?.appendLine(`Loaded audio files: ${audioFiles.join(", ")}`);
  } catch (err) {
    outputChannel?.appendLine(`Error loading audio files: ${err}`);
  }
}

function openAudioSelector(context: vscode.ExtensionContext) {
  refreshAudioFiles(context);

  const panel = vscode.window.createWebviewPanel(
    "yameteKudasaiAudioSelector",
    "Yamete Kudasai Audio Selector",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  const config = vscode.workspace.getConfiguration("yameteKudasai");
  const audioSelection = config.get<string>("audioSelection", "random");
  const customAudioPath = config.get<string>("customAudioPath", "C:/path/to/your-audio.mp3");

  const libraryOptions = ["random", ...audioFiles, "custom"];

  panel.webview.html = getAudioSelectorHtml(libraryOptions, audioSelection, customAudioPath);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === "save") {
      const selectedAudioSelection = String(message.audioSelection || "random");
      const selectedCustomPath = String(message.customAudioPath || "C:/path/to/your-audio.mp3");

      await config.update("audioSelection", selectedAudioSelection, vscode.ConfigurationTarget.Global);

      if (selectedAudioSelection === "custom") {
        await config.update("customAudioPath", selectedCustomPath, vscode.ConfigurationTarget.Global);
      }

      vscode.window.showInformationMessage("Yamete audio settings saved.");
      panel.dispose();
      return;
    }

    if (message.type === "preview") {
      const selectedAudioSelection = String(message.audioSelection || "random");
      const selectedCustomPath = String(message.customAudioPath || "");

      if (selectedAudioSelection === "custom") {
        if (!selectedCustomPath.trim()) {
          vscode.window.showWarningMessage("Please paste a custom audio link first.");
          return;
        }
        playAudioAtPath(resolveAudioPath(selectedCustomPath, context));
        return;
      }

      if (selectedAudioSelection !== "random") {
        playAudioAtPath(path.join(context.extensionPath, "assets", "audio", selectedAudioSelection));
        return;
      }

      playYamete(context, false);
    }
  });
}

function getAudioSelectorHtml(
  libraryOptions: string[],
  audioSelection: string,
  customAudioPath: string,
) {
  const selectedSelection = libraryOptions.includes(audioSelection) ? audioSelection : "random";
  const customDisabled = selectedSelection !== "custom" ? "disabled" : "";

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Yamete Audio Selector</title>
    <style>
      body { font-family: sans-serif; padding: 20px; color: #ddd; background: #1e1e1e; }
      .card { max-width: 760px; margin: 0 auto; padding: 20px; border: 1px solid #333; border-radius: 12px; background: #252526; }
      label { display: block; margin: 16px 0 8px; font-weight: 600; }
      select, input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #444; background: #111; color: #fff; box-sizing: border-box; }
      .row { display: flex; gap: 12px; margin-top: 18px; }
      button { padding: 10px 14px; border: none; border-radius: 8px; cursor: pointer; background: #0e639c; color: #fff; }
      button.secondary { background: #444; }
      .hint { color: #aaa; font-size: 12px; margin-top: 6px; }
      .small { font-size: 13px; color: #bdbdbd; margin-top: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Yamete Kudasai Audio Selector</h2>
      <div class="small">Default is <b>random</b>. You can switch to library audio or custom audio link.</div>

      <label for="mode">Audio source</label>
      <select id="mode">
        ${libraryOptions
          .map((item) => `<option value="${escapeHtml(item)}" ${item === selectedSelection ? "selected" : ""}>${escapeHtml(item)}</option>`)
          .join("")}
      </select>

      <div class="hint">Random is default. Pick any bundled file name from assets/audio, or choose custom.</div>

      <label for="custom">Custom audio link</label>
      <input id="custom" type="text" placeholder="C:/path/to/your-audio.mp3 or file:///C:/path/to/audio.mp3" value="${escapeHtml(customAudioPath)}" ${customDisabled} />
      <div class="hint">This becomes editable only when Custom is selected.</div>

      <div class="row">
        <button id="preview">Preview</button>
        <button id="save">Save</button>
        <button id="reset" class="secondary">Reset to Random</button>
      </div>
    </div>

    <script>
      const vscode = acquireVsCodeApi();
      const mode = document.getElementById('mode');
      const custom = document.getElementById('custom');
      const previewBtn = document.getElementById('preview');
      const saveBtn = document.getElementById('save');
      const resetBtn = document.getElementById('reset');

      function syncEnabledState() {
        custom.disabled = mode.value !== 'custom';
      }

      mode.addEventListener('change', syncEnabledState);

      previewBtn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'preview',
          audioSelection: mode.value,
          customAudioPath: custom.value,
        });
      });

      saveBtn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'save',
          audioSelection: mode.value,
          customAudioPath: custom.value,
        });
      });

      resetBtn.addEventListener('click', () => {
        mode.value = 'random';
        custom.value = 'C:/path/to/your-audio.mp3';
        syncEnabledState();
      });

      syncEnabledState();
    </script>
  </body>
  </html>`;
}

function resolveAudioPath(input: string, context: vscode.ExtensionContext) {
  if (!input) {
    return input;
  }

  if (input.startsWith("file://")) {
    return vscode.Uri.parse(input).fsPath;
  }

  if (path.isAbsolute(input)) {
    return input;
  }

  return path.join(context.extensionPath, "assets", "audio", input);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function playYamete(context: vscode.ExtensionContext, shouldPreventForTime: boolean = true) {
  // Check cooldown to prevent audio spam
  const now = Date.now();
  if (now - lastPlayTime < COOLDOWN_MS && shouldPreventForTime) {
    outputChannel.appendLine(`Cooldown active, skipping... (${Math.ceil((COOLDOWN_MS - (now - lastPlayTime)) / 1000)}s remaining)`);
    return;
  }
  lastPlayTime = now;

  // Note: do not early-return if bundled audio list is empty — user may have set a custom audio path.

  const config = vscode.workspace.getConfiguration("yameteKudasai");
  const audioSelection = config.get<string>("audioSelection", "random");
  const customPath = config.get<string>("customAudioPath", "");

  let audioPath = "";

  if (audioSelection === "custom") {
    const resolvedCustomPath = resolveAudioPath(customPath, context);
    if (resolvedCustomPath && fs.existsSync(resolvedCustomPath)) {
      audioPath = resolvedCustomPath;
    }
  }

  if (!audioPath && audioSelection !== "random" && audioSelection !== "custom") {
    const selectedLibraryPath = path.join(context.extensionPath, "assets", "audio", audioSelection);
    if (fs.existsSync(selectedLibraryPath)) {
      audioPath = selectedLibraryPath;
    }
  }

  if (!audioPath) {
    const priorityFile = "yamete.wav";
    let pick: string;
    if (audioFiles.includes(priorityFile) && Math.random() < 0.2) pick = priorityFile;
    else pick = audioFiles[Math.floor(Math.random() * audioFiles.length)];
    audioPath = path.join(context.extensionPath, "assets", "audio", pick);
  }
  // Verify the resolved audioPath exists before attempting playback
  if (!audioPath || !fs.existsSync(audioPath)) {
    outputChannel.appendLine(`No valid audio found to play: ${audioPath}`);
    return;
  }

  const volume = vscode.workspace
    .getConfiguration("yameteKudasai")
    .get("volume", 1.0);
  const escapedPath = audioPath.replace(/'/g, "''");

  outputChannel.appendLine(`Playing [${path.basename(audioPath)}]`);

  if (process.platform === "win32") {
    const mp3Command = `powershell -c "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${escapedPath}'); $player.Volume = ${volume}; $player.Play(); Start-Sleep -s 3"`;

    exec(mp3Command, (err: any) => {
      if (err) outputChannel.appendLine(`Playback Error: ${err.message || err}`);
    });
  } else if (process.platform === "darwin") {
    exec(`afplay "${audioPath}" -v ${volume}`, (err: any) => {
      if (err) outputChannel.appendLine(`Playback Error: ${err.message || err}`);
    });
  } else {
    exec(`aplay "${audioPath}"`, (err: any) => {
      if (err) outputChannel.appendLine(`Playback Error: ${err.message || err}`);
    });
  }
}

function playAudioAtPath(audioPath: string) {
  const volume = vscode.workspace.getConfiguration("yameteKudasai").get("volume", 1.0);
  const escapedPath = audioPath.replace(/'/g, "''");
  outputChannel?.appendLine(`Playing preview [${audioPath}]`);

  if (process.platform === "win32") {
    const mp3Command = `powershell -c "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${escapedPath}'); $player.Volume = ${volume}; $player.Play(); Start-Sleep -s 3"`;
    exec(mp3Command, (err: any) => {
      if (err) outputChannel.appendLine(`Playback Error: ${err.message || err}`);
    });
  } else if (process.platform === "darwin") {
    exec(`afplay "${audioPath}" -v ${volume}`, (err: any) => {
      if (err) outputChannel.appendLine(`Playback Error: ${err.message || err}`);
    });
  } else {
    exec(`aplay "${audioPath}"`, (err: any) => {
      if (err) outputChannel.appendLine(`Playback Error: ${err.message || err}`);
    });
  }
}

export function deactivate() {}
