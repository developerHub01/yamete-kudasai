"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
let outputChannel;
let statusBarItem;
let audioFiles = [];
function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Yamete Kudasai Monitor");
    outputChannel.appendLine("Yamete Kudasai Monitor is now active!");
    // Load audio files dynamically
    refreshAudioFiles(context);
    // Status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = `$(heart) Yamete Active`;
    statusBarItem.tooltip = "Click to test or right-click for settings";
    statusBarItem.command = "yameteKudasai.testAudio";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Command: Test Audio
    context.subscriptions.push(vscode.commands.registerCommand("yameteKudasai.testAudio", () => {
        outputChannel.appendLine("Manual test triggered.");
        playYamete(context);
        vscode.window.showInformationMessage("Yamete Kudasai! Audio tested.");
    }));
    // Command: Open Settings
    context.subscriptions.push(vscode.commands.registerCommand("yameteKudasai.openSettings", () => {
        vscode.commands.executeCommand("workbench.action.openSettings", "Yamete Kudasai");
    }));
    // Command: Refresh Audio List
    context.subscriptions.push(vscode.commands.registerCommand("yameteKudasai.refreshAudio", () => {
        refreshAudioFiles(context);
        vscode.window.showInformationMessage(`Loaded ${audioFiles.length} audio files.`);
    }));
    const errorTracker = new Map();
    // Helper to check errors on a specific URI
    function checkDiagnostics(uri) {
        const config = vscode.workspace.getConfiguration("yameteKudasai");
        if (!config.get("monitorCodeErrors"))
            return;
        const uriStr = uri.toString();
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const currentCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
        const previousCount = errorTracker.get(uriStr) || 0;
        if (currentCount > previousCount) {
            outputChannel.appendLine(`[${path.basename(uri.fsPath)}] New error detected! (${previousCount} -> ${currentCount})`);
            triggerEffect();
            playYamete(context);
        }
        errorTracker.set(uriStr, currentCount);
    }
    // 1. Monitor Codebase Errors (Hyper-consistent per-file tracking)
    const diagnosticListener = vscode.languages.onDidChangeDiagnostics((event) => {
        event.uris.forEach((uri) => checkDiagnostics(uri));
    });
    // Extra consistency: check errors when switching or saving files
    const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor)
            checkDiagnostics(editor.document.uri);
    });
    const docSaveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
        checkDiagnostics(doc.uri);
    });
    // 2. Monitor Terminal Errors
    const win = vscode.window;
    if (win.onDidEndTerminalShellExecution) {
        context.subscriptions.push(win.onDidEndTerminalShellExecution((event) => {
            const config = vscode.workspace.getConfiguration("yameteKudasai");
            if (!config.get("monitorTerminalErrors"))
                return;
            if (event.exitCode !== undefined && event.exitCode !== 0) {
                outputChannel.appendLine(`Terminal failed with code: ${event.exitCode}`);
                triggerEffect();
                playYamete(context);
            }
        }));
    }
    function triggerEffect() {
        statusBarItem.text = `$(warning) Yamete!!`;
        statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        setTimeout(() => {
            statusBarItem.text = `$(heart) Yamete Active`;
            statusBarItem.backgroundColor = undefined;
        }, 3000);
    }
    context.subscriptions.push(diagnosticListener, activeEditorListener, docSaveListener);
}
function refreshAudioFiles(context) {
    const audioDir = path.join(context.extensionPath, "assets", "audio");
    try {
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir, { recursive: true });
        }
        audioFiles = fs
            .readdirSync(audioDir)
            .filter((file) => file.endsWith(".mp3") || file.endsWith(".wav"));
        outputChannel?.appendLine(`Loaded audio files: ${audioFiles.join(", ")}`);
    }
    catch (err) {
        outputChannel?.appendLine(`Error loading audio files: ${err}`);
    }
}
function playYamete(context) {
    if (audioFiles.length === 0) {
        outputChannel.appendLine("No audio files found in assets/audio");
        return;
    }
    // priority logic for yamete.mp3
    let randomFile;
    const priorityFile = "yamete.wav";
    // 50% chance to play yamete.mp3 if it exists, else random from all
    if (audioFiles.includes(priorityFile) && Math.random() < 0.2) {
        randomFile = priorityFile;
    }
    else {
        randomFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
    }
    const audioPath = path.join(context.extensionPath, "assets", "audio", randomFile);
    const volume = vscode.workspace
        .getConfiguration("yameteKudasai")
        .get("volume", 1.0);
    const escapedPath = audioPath.replace(/'/g, "''");
    outputChannel.appendLine(`Playing [${randomFile}]`);
    if (process.platform === "win32") {
        const mp3Command = `powershell -c "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${escapedPath}'); $player.Volume = ${volume}; $player.Play(); Start-Sleep -s 3"`;
        (0, child_process_1.exec)(mp3Command, (err) => {
            if (err)
                outputChannel.appendLine(`Playback Error: ${err.message}`);
        });
    }
    else if (process.platform === "darwin") {
        (0, child_process_1.exec)(`afplay "${audioPath}" -v ${volume}`);
    }
    else {
        (0, child_process_1.exec)(`aplay "${audioPath}"`);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map