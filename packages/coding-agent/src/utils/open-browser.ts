import { spawn } from "node:child_process";
import { isWSL } from "./wsl.ts";

/**
 * Open a URL or file in the platform browser/default handler.
 *
 * This intentionally never invokes a shell. On Windows, do not use
 * `cmd /c start`: cmd.exe re-parses metacharacters (&, |, ^, ...) before
 * `start` runs, which would make attacker-controlled URLs injectable.
 * WSL reaches the Windows browser through the same rundll32 handler via
 * executable interop.
 *
 * Resolves false when the launcher cannot start (for example, a missing
 * xdg-open) or reports failure through a nonzero exit code. A true result
 * only means the platform accepted the open request.
 */
export function openBrowser(target: string): Promise<boolean> {
	const [cmd, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [target]]
			: process.platform === "win32"
				? ["rundll32", ["url.dll,FileProtocolHandler", target]]
				: isWSL()
					? ["rundll32.exe", ["url.dll,FileProtocolHandler", target]]
					: ["xdg-open", [target]];

	// On WSL, xdg-open launches explorer.exe, which fails when the cwd's
	// \\wsl.localhost\... path exceeds MAX_PATH (#11592). The target is a URL,
	// so no launcher needs pi's cwd.
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { stdio: "ignore", detached: true, cwd: "/" });
		child.on("error", () => resolve(false));
		child.on("exit", (code) => resolve(code === 0));
		child.unref();
	});
}
