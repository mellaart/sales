Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$targets = @(
    [PSCustomObject]@{
        Name = "WIPay"
        HostName = "wt.worldline-solutions.com"
        Port = 9001
    },
    [PSCustomObject]@{
        Name = "Transactiehost"
        HostName = "ctapccawl.payment.banksys.be"
        Port = 20013
    },
    [PSCustomObject]@{
        Name = "Securityhost"
        HostName = "sp.payment.banksys.be"
        Port = 5461
    }
)

$script:lastResults = @()
$script:lastTestedAt = $null

function New-Color {
    param([Parameter(Mandatory = $true)][string]$Hex)
    return [System.Drawing.ColorTranslator]::FromHtml($Hex)
}

function Test-WorldlineEndpoint {
    param(
        [Parameter(Mandatory = $true)]$Target,
        [int]$TimeoutMilliseconds = 8000
    )

    $resolvedAddresses = @()

    try {
        $resolvedAddresses = @(
            [System.Net.Dns]::GetHostAddresses($Target.HostName) |
                ForEach-Object { $_.IPAddressToString } |
                Select-Object -Unique
        )
    }
    catch {
        return [PSCustomObject]@{
            Name = $Target.Name
            HostName = $Target.HostName
            Port = $Target.Port
            Dns = "Mislukt"
            Addresses = "-"
            Tcp = "Mislukt"
            LatencyMs = $null
            Detail = "DNS kon de hostnaam niet vinden: $($_.Exception.GetBaseException().Message)"
            Success = $false
        }
    }

    $client = New-Object System.Net.Sockets.TcpClient
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        $connectTask = $client.ConnectAsync($Target.HostName, [int]$Target.Port)
        $completed = $connectTask.Wait($TimeoutMilliseconds)
        $stopwatch.Stop()

        if (-not $completed) {
            return [PSCustomObject]@{
                Name = $Target.Name
                HostName = $Target.HostName
                Port = $Target.Port
                Dns = "OK"
                Addresses = ($resolvedAddresses -join ", ")
                Tcp = "Time-out"
                LatencyMs = $null
                Detail = "Binnen $([Math]::Round($TimeoutMilliseconds / 1000)) seconden is geen TCP-verbinding opgebouwd."
                Success = $false
            }
        }

        if (-not $client.Connected) {
            throw "De TCP-verbinding is niet tot stand gekomen."
        }

        return [PSCustomObject]@{
            Name = $Target.Name
            HostName = $Target.HostName
            Port = $Target.Port
            Dns = "OK"
            Addresses = ($resolvedAddresses -join ", ")
            Tcp = "Bereikbaar"
            LatencyMs = [Math]::Max(1, [Math]::Round($stopwatch.Elapsed.TotalMilliseconds))
            Detail = "Uitgaande TCP-verbinding geslaagd."
            Success = $true
        }
    }
    catch {
        $stopwatch.Stop()
        return [PSCustomObject]@{
            Name = $Target.Name
            HostName = $Target.HostName
            Port = $Target.Port
            Dns = "OK"
            Addresses = ($resolvedAddresses -join ", ")
            Tcp = "Mislukt"
            LatencyMs = $null
            Detail = $_.Exception.GetBaseException().Message
            Success = $false
        }
    }
    finally {
        $stopwatch.Stop()
        $client.Close()
        $client.Dispose()
    }
}

function Get-ReportText {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("WORLDLINE CONNECTIVITY TEST")
    $lines.Add("Smart Trade - Troublefree B.V.")
    $lines.Add("")
    $lines.Add("Getest op: $($script:lastTestedAt.ToString('dd-MM-yyyy HH:mm:ss'))")
    $lines.Add("Computer: $env:COMPUTERNAME")
    $lines.Add("")

    foreach ($result in $script:lastResults) {
        $status = if ($result.Success) { "OK" } else { "MISLUKT" }
        $latency = if ($null -eq $result.LatencyMs) { "-" } else { "$($result.LatencyMs) ms" }

        $lines.Add("$($result.Name): $status")
        $lines.Add("  Host: $($result.HostName):$($result.Port)")
        $lines.Add("  DNS: $($result.Dns)")
        $lines.Add("  IP-adres(sen): $($result.Addresses)")
        $lines.Add("  TCP: $($result.Tcp)")
        $lines.Add("  Reactietijd: $latency")
        $lines.Add("  Detail: $($result.Detail)")
        $lines.Add("")
    }

    $lines.Add("Een mislukte test kan worden veroorzaakt door de firewall, DNS, routing of een tijdelijk onbereikbare host.")
    return ($lines -join [Environment]::NewLine)
}

$navy = New-Color "#0B1728"
$panel = New-Color "#132238"
$line = New-Color "#31445E"
$text = New-Color "#F4F7FB"
$muted = New-Color "#A9B8CC"
$blue = New-Color "#2F7BDC"
$green = New-Color "#2CBA78"
$red = New-Color "#D95763"
$amber = New-Color "#E8A63B"

$form = New-Object System.Windows.Forms.Form
$form.Text = "Worldline Connectivity Test"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(980, 650)
$form.MinimumSize = New-Object System.Drawing.Size(900, 610)
$form.BackColor = $navy
$form.ForeColor = $text
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Icon = [System.Drawing.SystemIcons]::Shield

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Worldline Connectivity Test"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 22)
$titleLabel.ForeColor = $text
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(34, 26)
$form.Controls.Add($titleLabel)

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Text = "Controleer de uitgaande verbinding vanaf hetzelfde netwerk als de betaalterminal."
$subtitleLabel.ForeColor = $muted
$subtitleLabel.AutoSize = $true
$subtitleLabel.Location = New-Object System.Drawing.Point(38, 70)
$form.Controls.Add($subtitleLabel)

$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Location = New-Object System.Drawing.Point(38, 108)
$statusPanel.Size = New-Object System.Drawing.Size(886, 54)
$statusPanel.BackColor = $panel
$statusPanel.Anchor = "Top, Left, Right"
$form.Controls.Add($statusPanel)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Klaar om te testen"
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
$statusLabel.ForeColor = $muted
$statusLabel.AutoSize = $true
$statusLabel.Location = New-Object System.Drawing.Point(18, 16)
$statusPanel.Controls.Add($statusLabel)

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Location = New-Object System.Drawing.Point(38, 184)
$grid.Size = New-Object System.Drawing.Size(886, 270)
$grid.Anchor = "Top, Bottom, Left, Right"
$grid.BackgroundColor = $panel
$grid.BorderStyle = "None"
$grid.GridColor = $line
$grid.EnableHeadersVisualStyles = $false
$grid.ColumnHeadersDefaultCellStyle.BackColor = $navy
$grid.ColumnHeadersDefaultCellStyle.ForeColor = $muted
$grid.ColumnHeadersDefaultCellStyle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9)
$grid.ColumnHeadersHeight = 42
$grid.DefaultCellStyle.BackColor = $panel
$grid.DefaultCellStyle.ForeColor = $text
$grid.DefaultCellStyle.SelectionBackColor = $panel
$grid.DefaultCellStyle.SelectionForeColor = $text
$grid.DefaultCellStyle.Padding = New-Object System.Windows.Forms.Padding(6)
$grid.RowHeadersVisible = $false
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.AllowUserToResizeRows = $false
$grid.ReadOnly = $true
$grid.MultiSelect = $false
$grid.SelectionMode = "FullRowSelect"
$grid.AutoSizeColumnsMode = "Fill"
$grid.RowTemplate.Height = 50
$null = $grid.Columns.Add("Name", "Verbinding")
$null = $grid.Columns.Add("Destination", "Doel")
$null = $grid.Columns.Add("Dns", "DNS")
$null = $grid.Columns.Add("Tcp", "TCP")
$null = $grid.Columns.Add("Latency", "Reactietijd")
$grid.Columns[0].FillWeight = 85
$grid.Columns[1].FillWeight = 175
$grid.Columns[2].FillWeight = 55
$grid.Columns[3].FillWeight = 70
$grid.Columns[4].FillWeight = 65
$form.Controls.Add($grid)

foreach ($target in $targets) {
    $null = $grid.Rows.Add(
        $target.Name,
        "$($target.HostName):$($target.Port)",
        "Nog niet getest",
        "Nog niet getest",
        "-"
    )
}

$detailLabel = New-Object System.Windows.Forms.Label
$detailLabel.Text = "De test wijzigt geen firewallinstellingen en verstuurt geen klantgegevens."
$detailLabel.ForeColor = $muted
$detailLabel.AutoSize = $true
$detailLabel.Location = New-Object System.Drawing.Point(38, 474)
$detailLabel.Anchor = "Bottom, Left"
$form.Controls.Add($detailLabel)

$testButton = New-Object System.Windows.Forms.Button
$testButton.Text = "Start test"
$testButton.Location = New-Object System.Drawing.Point(38, 520)
$testButton.Size = New-Object System.Drawing.Size(150, 44)
$testButton.Anchor = "Bottom, Left"
$testButton.FlatStyle = "Flat"
$testButton.FlatAppearance.BorderSize = 0
$testButton.BackColor = $blue
$testButton.ForeColor = [System.Drawing.Color]::White
$testButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$form.Controls.Add($testButton)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Text = "Rapport opslaan"
$saveButton.Location = New-Object System.Drawing.Point(200, 520)
$saveButton.Size = New-Object System.Drawing.Size(160, 44)
$saveButton.Anchor = "Bottom, Left"
$saveButton.FlatStyle = "Flat"
$saveButton.FlatAppearance.BorderColor = $line
$saveButton.BackColor = $panel
$saveButton.ForeColor = $text
$saveButton.Enabled = $false
$form.Controls.Add($saveButton)

$copyButton = New-Object System.Windows.Forms.Button
$copyButton.Text = "Rapport kopieren"
$copyButton.Location = New-Object System.Drawing.Point(372, 520)
$copyButton.Size = New-Object System.Drawing.Size(160, 44)
$copyButton.Anchor = "Bottom, Left"
$copyButton.FlatStyle = "Flat"
$copyButton.FlatAppearance.BorderColor = $line
$copyButton.BackColor = $panel
$copyButton.ForeColor = $text
$copyButton.Enabled = $false
$form.Controls.Add($copyButton)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Text = "Sluiten"
$closeButton.Location = New-Object System.Drawing.Point(774, 520)
$closeButton.Size = New-Object System.Drawing.Size(150, 44)
$closeButton.Anchor = "Bottom, Right"
$closeButton.FlatStyle = "Flat"
$closeButton.FlatAppearance.BorderColor = $line
$closeButton.BackColor = $panel
$closeButton.ForeColor = $text
$form.Controls.Add($closeButton)

$testButton.Add_Click({
    $testButton.Enabled = $false
    $saveButton.Enabled = $false
    $copyButton.Enabled = $false
    $script:lastResults = @()
    $successCount = 0

    for ($index = 0; $index -lt $targets.Count; $index++) {
        $target = $targets[$index]
        $statusLabel.Text = "Bezig met $($target.Name)..."
        $statusLabel.ForeColor = $amber
        $grid.Rows[$index].Cells[2].Value = "Bezig..."
        $grid.Rows[$index].Cells[3].Value = "Bezig..."
        $grid.Rows[$index].Cells[4].Value = "-"
        [System.Windows.Forms.Application]::DoEvents()

        $result = Test-WorldlineEndpoint -Target $target
        $script:lastResults += $result

        $grid.Rows[$index].Cells[2].Value = $result.Dns
        $grid.Rows[$index].Cells[3].Value = $result.Tcp
        $grid.Rows[$index].Cells[4].Value = if ($null -eq $result.LatencyMs) { "-" } else { "$($result.LatencyMs) ms" }

        if ($result.Success) {
            $successCount++
            $grid.Rows[$index].DefaultCellStyle.ForeColor = $green
        }
        else {
            $grid.Rows[$index].DefaultCellStyle.ForeColor = $red
        }

        [System.Windows.Forms.Application]::DoEvents()
    }

    $script:lastTestedAt = Get-Date
    $saveButton.Enabled = $true
    $copyButton.Enabled = $true
    $testButton.Enabled = $true

    if ($successCount -eq $targets.Count) {
        $statusLabel.Text = "Alle Worldline-verbindingen zijn bereikbaar"
        $statusLabel.ForeColor = $green
    }
    else {
        $failedCount = $targets.Count - $successCount
        $statusLabel.Text = "$failedCount van de $($targets.Count) verbindingen vraagt aandacht"
        $statusLabel.ForeColor = $red
    }
})

$saveButton.Add_Click({
    if ($script:lastResults.Count -eq 0) { return }

    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Title = "Worldline testrapport opslaan"
    $dialog.Filter = "Tekstbestand (*.txt)|*.txt"
    $dialog.FileName = "Worldline-connectiviteit-$($script:lastTestedAt.ToString('yyyyMMdd-HHmm')).txt"
    $dialog.InitialDirectory = [Environment]::GetFolderPath("Desktop")

    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [System.IO.File]::WriteAllText($dialog.FileName, (Get-ReportText), [System.Text.Encoding]::UTF8)
        [System.Windows.Forms.MessageBox]::Show(
            "Het rapport is opgeslagen.",
            "Worldline Connectivity Test",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
    }
})

$copyButton.Add_Click({
    if ($script:lastResults.Count -eq 0) { return }

    [System.Windows.Forms.Clipboard]::SetText((Get-ReportText))
    $statusLabel.Text = "Rapport naar het klembord gekopieerd"
    $statusLabel.ForeColor = $green
})

$closeButton.Add_Click({ $form.Close() })

[void]$form.ShowDialog()
