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
      playYamete(context);
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
      .filter((file) => file.endsWith(".mp3") || file.endsWith(".wav"));
    outputChannel?.appendLine(`Loaded audio files: ${audioFiles.join(", ")}`);
  } catch (err) {
    outputChannel?.appendLine(`Error loading audio files: ${err}`);
  }
}

function playYamete(context: vscode.ExtensionContext) {
  // Check cooldown to prevent audio spam
  const now = Date.now();
  if (now - lastPlayTime < COOLDOWN_MS) {
    outputChannel.appendLine(`Cooldown active, skipping... (${Math.ceil((COOLDOWN_MS - (now - lastPlayTime)) / 1000)}s remaining)`);
    return;
  }
  lastPlayTime = now;

  if (audioFiles.length === 0) {
    outputChannel.appendLine("No audio files found in assets/audio");
    return;
  }

  // priority logic for yamete.mp3
  let randomFile: string;
  const priorityFile = "yamete.mp3";

  // 50% chance to play yamete.mp3 if it exists, else random from all
  if (audioFiles.includes(priorityFile) && Math.random() < 0.2) {
    randomFile = priorityFile;
  } else {
    randomFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
  }

  const audioPath = path.join(
    context.extensionPath,
    "assets",
    "audio",
    randomFile,
  );
  const volume = vscode.workspace
    .getConfiguration("yameteKudasai")
    .get("volume", 1.0);
  const escapedPath = audioPath.replace(/'/g, "''");

  outputChannel.appendLine(`Playing [${randomFile}]`);

  if (process.platform === "win32") {
    const mp3Command = `powershell -c "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${escapedPath}'); $player.Volume = ${volume}; $player.Play(); Start-Sleep -s 3"`;

    exec(mp3Command, (err) => {
      if (err) outputChannel.appendLine(`Playback Error: ${err.message}`);
    });
  } else if (process.platform === "darwin") {
    exec(`afplay "${audioPath}" -v ${volume}`);
  } else {
    exec(`aplay "${audioPath}"`);
  }
}

export function deactivate() {}
