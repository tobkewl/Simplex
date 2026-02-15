function createPoeInputScriptService({
  app,
  fs,
  path,
  logger,
  scriptName = 'send-to-poe.ps1',
}) {
  let scriptPath = null;

  function getScriptPath() {
    try {
      const dir = app.getPath('userData');
      fs.mkdirSync(dir, { recursive: true });
      return path.join(dir, scriptName);
    } catch {
      return path.join(process.cwd(), scriptName);
    }
  }

  function writeScript() {
    if (!scriptPath) scriptPath = getScriptPath();
    const lines = [];
    lines.push("Add-Type @'");
    lines.push('using System;');
    lines.push('using System.Runtime.InteropServices;');
    lines.push('using System.Text;');
    lines.push('public class WinAPI {');
    lines.push('  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);');
    lines.push('  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);');
    lines.push('  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);');
    lines.push('  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);');
    lines.push('  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);');
    lines.push('  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);');
    lines.push('  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);');
    lines.push('  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();');
    lines.push('  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();');
    lines.push('  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);');
    lines.push('  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);');
    lines.push('  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);');
    lines.push('  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);');
    lines.push('  public const uint KEYEVENTF_KEYUP = 0x0002;');
    lines.push('}');
    lines.push("'@");
    lines.push('');
    lines.push('$poeHandle = [IntPtr]::Zero');
    lines.push("$wantedTitles = @('Path of Exile','Path of Exile 2','Path of Exile on GeForce NOW','Path of Exile 2 on GeForce NOW')");
    lines.push('$callback = {');
    lines.push('  param($hwnd, $lParam)');
    lines.push('  $className = New-Object System.Text.StringBuilder 256');
    lines.push('  [WinAPI]::GetClassName($hwnd, $className, $className.Capacity) | Out-Null');
    lines.push('  $class = $className.ToString()');
    lines.push("  if ($class -eq 'POEWindowClass') { $script:poeHandle = $hwnd; return $false }");
    lines.push('  $title = New-Object System.Text.StringBuilder 512');
    lines.push('  [WinAPI]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null');
    lines.push('  if ($wantedTitles -contains $title.ToString()) { $script:poeHandle = $hwnd; return $false }');
    lines.push('  return $true');
    lines.push('}');
    lines.push('[WinAPI]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null');
    lines.push("if ($poeHandle -eq [IntPtr]::Zero) { Write-Output 'ERROR:NO_POE_WINDOW'; exit 1 }");
    lines.push("Write-Output 'FOUND:POE_WINDOW'");
    lines.push('');
    lines.push('$currentThread = [WinAPI]::GetCurrentThreadId()');
    lines.push('$targetThread = [WinAPI]::GetWindowThreadProcessId($poeHandle, [IntPtr]::Zero)');
    lines.push('[WinAPI]::AttachThreadInput($currentThread, $targetThread, $true) | Out-Null');
    lines.push('[WinAPI]::BringWindowToTop($poeHandle) | Out-Null');
    lines.push('[WinAPI]::SetForegroundWindow($poeHandle) | Out-Null');
    lines.push('[WinAPI]::SetFocus($poeHandle) | Out-Null');
    lines.push('[WinAPI]::AttachThreadInput($currentThread, $targetThread, $false) | Out-Null');
    lines.push('');
    lines.push('$maxWait = 100; $waited = 0');
    lines.push('while ($waited -lt $maxWait) {');
    lines.push('  if ([WinAPI]::GetForegroundWindow() -eq $poeHandle) { break }');
    lines.push('  Start-Sleep -Milliseconds 1; $waited++');
    lines.push('}');
    lines.push("if ($waited -ge $maxWait) { Write-Output 'WARN:FOCUS_TIMEOUT' }");
    lines.push("Write-Output 'FOCUS_OK'");
    lines.push('');
    lines.push('$VK_RETURN = 0x0D; $VK_CONTROL = 0x11; $VK_V = 0x56; $VK_A = 0x41; $VK_MENU = 0x12');
    lines.push('');
    lines.push('# Clear Alt');
    lines.push('[WinAPI]::keybd_event([byte]$VK_MENU, 0, 0, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_MENU, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
    lines.push('');
    lines.push('# Enter (open chat)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, 0, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
    lines.push('');
    lines.push('# Ctrl+A (select all) - minimal delay');
    lines.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, 0, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_A, 0, 0, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_A, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
    lines.push('');
    lines.push('# Ctrl+V (paste) - minimal delay');
    lines.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, 0, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_V, 0, 0, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_V, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
    lines.push('');
    lines.push('# Enter (send)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, 0, [UIntPtr]::Zero)');
    lines.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
    lines.push("Write-Output 'SUCCESS'");

    try {
      const body = lines.join('\r\n')
        .replace(/@\\\"/g, '@"')
        .replace(/\\\"@/g, '"@')
        .replace(/\\\"/g, '"');
      fs.writeFileSync(scriptPath, body, 'utf8');
    } catch (err) {
      try {
        logger.error('poe:script:write-failed', { error: String(err) });
      } catch {}
    }
    return scriptPath;
  }

  function ensureScriptPath() {
    try {
      if (!scriptPath) writeScript();
    } catch {}
    let resolvedPath = scriptPath || getScriptPath();
    try {
      if (!fs.existsSync(resolvedPath)) writeScript();
    } catch {}
    try {
      const head = fs.readFileSync(resolvedPath, 'utf8').slice(0, 200);
      if (head.includes('Add-Type @"')) {
        writeScript();
        resolvedPath = scriptPath || resolvedPath;
      }
    } catch {}
    return resolvedPath;
  }

  return {
    writePoeScript: writeScript,
    ensurePoeScriptPath: ensureScriptPath,
  };
}

module.exports = {
  createPoeInputScriptService,
};
