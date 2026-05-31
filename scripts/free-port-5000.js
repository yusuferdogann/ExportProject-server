/**
 * Windows-dev convenience:
 * `npm run start` öncesi 5000 portunu otomatik boşaltır.
 *
 * Not: Bu proje ortamında 5000 portunu bazen Cursor'un arka plan node.exe'si tutabiliyor.
 * Burada hedef: kullanıcı tek komutla (`npm run start`) server'ı kaldırabilsin.
 */
const { execSync } = require("child_process");

function run(cmd, { timeoutMs = 5000 } = {}) {
  return execSync(cmd, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: timeoutMs,
  }).trim();
}

function isWindows() {
  return process.platform === "win32";
}

function ps(cmd) {
  // Bazı Windows kurulumlarında "powershell" PATH'te olmayabiliyor.
  const shells = [
    "powershell.exe",
    "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe",
    "pwsh.exe",
    "powershell",
  ];
  let lastErr = null;
  for (const sh of shells) {
    try {
      return run(
        `${sh} -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`,
        { timeoutMs: 5000 },
      );
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No PowerShell found");
}

function main() {
  // Windows dışı ortamlarda hiçbir şey yapma (cross-platform kırmasın)
  if (!isWindows()) return;

  try {
    const pidStr = ps(
      "(Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)",
    );

    const pid = Number(pidStr);
    if (!pid || Number.isNaN(pid)) return;

    // Kendi process'ini kapatma
    if (pid === process.pid) return;

    // Güvenli: sadece portu tutanı kapat (bu repo dev akışı için)
    ps(`Stop-Process -Id ${pid} -Force`);
    // eslint-disable-next-line no-console
    console.log(`[prestart] Port 5000 boşaltıldı (kapatılan PID=${pid}).`);
  } catch (err) {
    // Fallback: kill-port dene (bazı ortamlarda Get-NetTCPConnection/Stop-Process engellenebilir)
    try {
      run("npx --yes kill-port 5000", { timeoutMs: 8000 });
      // eslint-disable-next-line no-console
      console.log("[prestart] Port 5000 boşaltıldı (kill-port).");
      return;
    } catch (_) {}

    // prestart asla start'ı kırmasın
    const details =
      (err && (err.stderr || err.stdout) && String(err.stderr || err.stdout)) ||
      (err && err.message) ||
      String(err);
    // eslint-disable-next-line no-console
    console.warn("[prestart] Port 5000 kontrol/kapama başarısız (devam).", details);
  }
}

main();

