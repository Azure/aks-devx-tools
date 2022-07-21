import * as shell from 'shelljs';
import * as os from "os";
import path = require('path');
const { exec } = require('child_process');

export function runCommand(command: string): string {
    const cmdRun = exec(command).stdout;

    return cmdRun;
}

export function baseInstallFolder(): string {
  return path.join(os.homedir(), `.vscode/.vs-aksdevx/tools`);
}
