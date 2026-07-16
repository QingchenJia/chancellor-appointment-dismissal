param(
    [string]$Url = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$port = 9333
$profile = Join-Path ([IO.Path]::GetTempPath()) ("song-ui-smoke-" + [guid]::NewGuid())
$process = $null
$socket = $null
$nextId = 0

function Invoke-Cdp {
    param(
        [Parameter(Mandatory)] [string]$Method,
        [hashtable]$Params = @{}
    )

    $script:nextId += 1
    $id = $script:nextId
    $payload = @{ id = $id; method = $Method; params = $Params } |
        ConvertTo-Json -Compress -Depth 12
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    [void]($socket.SendAsync(
        $segment,
        [Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult())

    while ($true) {
        $buffer = [byte[]]::new(65536)
        $builder = [Text.StringBuilder]::new()
        do {
            $receiveSegment = [ArraySegment[byte]]::new($buffer)
            $received = $socket.ReceiveAsync(
                $receiveSegment,
                [Threading.CancellationToken]::None
            ).GetAwaiter().GetResult()
            [void]$builder.Append(
                [Text.Encoding]::UTF8.GetString($buffer, 0, $received.Count)
            )
        } while (-not $received.EndOfMessage)

        $message = $builder.ToString() | ConvertFrom-Json
        if ($message.id -eq $id) {
            return $message
        }
    }
}

try {
    $process = Start-Process -FilePath $chrome -ArgumentList @(
        "--headless=new",
        "--disable-gpu",
        "--remote-debugging-port=$port",
        "--user-data-dir=$profile",
        "--window-size=1440,900",
        $Url
    ) -WindowStyle Hidden -PassThru

    $targets = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $targets = Invoke-RestMethod "http://127.0.0.1:$port/json/list"
            if ($targets) { break }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $targets) { throw "Chrome DevTools target did not become available." }

    $target = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
    $socket = [Net.WebSockets.ClientWebSocket]::new()
    [void]($socket.ConnectAsync(
        [Uri]$target.webSocketDebuggerUrl,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult())

    [void](Invoke-Cdp -Method "Runtime.enable")
    $expression = @'
(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (predicate, timeout = 5000) => {
        const started = Date.now();
        while (!predicate()) {
            if (Date.now() - started > timeout) throw new Error("Timed out waiting for UI state");
            await wait(50);
        }
    };

    await waitFor(() => document.querySelectorAll("#resultsBody tr").length > 0);
    const initialCount = document.querySelector("#resultCount").textContent;
    const person = document.querySelector("#person");
    person.value = "\u8d75\u666e";
    person.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#searchButton").click();
    await waitFor(() => !document.querySelector("#searchButton").disabled);

    const filteredCount = document.querySelector("#resultCount").textContent;
    const filterChip = document.querySelector(".filter-chip");
    const firstRow = document.querySelector("#resultsBody tr");
    firstRow.focus();
    firstRow.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => document.querySelector(".source-text"));

    const drawer = document.querySelector("#detailDrawer");
    const drawerOpen = drawer.classList.contains("is-open") && drawer.getAttribute("aria-hidden") === "false";
    const focusOnClose = document.activeElement.id === "closeDetail";
    const detailHasSource = document.querySelector(".source-text").textContent.trim().length > 0;

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(300);
    const drawerClosed = drawer.getAttribute("aria-hidden") === "true";
    const focusRestored = document.activeElement === firstRow;

    document.querySelector('[data-type="dismissal"]').click();
    await waitFor(() => !document.querySelector("#searchButton").disabled);
    const quickFilterActive = document.querySelector('[data-type="dismissal"]').getAttribute("aria-pressed") === "true";

    return {
        initialCount,
        filteredCount,
        filterChanged: initialCount !== filteredCount,
        filterChipVisible: Boolean(filterChip),
        drawerOpen,
        focusOnClose,
        detailHasSource,
        drawerClosed,
        focusRestored,
        quickFilterActive,
    };
})()
'@

    $response = Invoke-Cdp -Method "Runtime.evaluate" -Params @{
        expression = $expression
        awaitPromise = $true
        returnByValue = $true
    }
    $result = $response.result.result.value
    $required = @(
        "filterChanged",
        "filterChipVisible",
        "drawerOpen",
        "focusOnClose",
        "detailHasSource",
        "drawerClosed",
        "focusRestored",
        "quickFilterActive"
    )
    foreach ($property in $required) {
        if (-not $result.$property) {
            throw "Browser smoke assertion failed: $property"
        }
    }
    $result | ConvertTo-Json -Compress
} finally {
    if ($socket) { $socket.Dispose() }
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $resolvedProfile = [IO.Path]::GetFullPath($profile)
    if ($resolvedProfile.StartsWith($tempRoot) -and (Test-Path -LiteralPath $resolvedProfile)) {
        Get-CimInstance Win32_Process |
            Where-Object { $_.CommandLine -like "*$resolvedProfile*" } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        for ($attempt = 0; $attempt -lt 5; $attempt++) {
            try {
                Remove-Item -Recurse -Force -LiteralPath $resolvedProfile -ErrorAction Stop
                break
            } catch {
                if ($attempt -eq 4) { throw }
                Start-Sleep -Milliseconds 200
            }
        }
    }
}
