$extractPath = $args[0]
$msiPath = $args[1]
$scriptPath = $args[2]
$FullMsiPath = (Resolve-Path $msiPath).Path

Write-Verbose "vars: $extractPath - $msiPath - $scriptPath"
         
# $windowsInstaller = New-Object -com WindowsInstaller.Installer
         
# $database = $windowsInstaller.GetType().InvokeMember("OpenDatabase", "InvokeMethod", $Null, $windowsInstaller, @($FullMsiPath, 0))
# $q = "SELECT Value FROM Property WHERE Property = 'ProductVersion'"
# $View = $database.GetType().InvokeMember("OpenView", "InvokeMethod", $Null, $database, ($q))
# $View.GetType().InvokeMember("Execute", "InvokeMethod", $Null, $View, $Null)
# $record = $View.GetType().InvokeMember("Fetch", "InvokeMethod", $Null, $View, $Null)
# $productVersion = $record.GetType().InvokeMember("StringData", "GetProperty", $Null, $record, 1)
# $View.GetType().InvokeMember("Close", "InvokeMethod", $Null, $View, $Null)

# & "$($scriptPath)\ExtractMSI.ps1" -MSIPath $FullMsiPath -TargetDir "$($extractPath)\$($productVersion)\" -LessMSIPath $scriptPath -UseLessMSI $true

# Remove-Item -Path $FullMsiPath

# Get-ChildItem -Path "$($extractPath)\$($productVersion)\SourceDir\Acumatica ERP" | Move-Item -Destination "$($extractPath)\$($productVersion)"

# Remove-Item -Path "$($extractPath)\$($productVersion)\SourceDir" -Recurse -Force -Confirm:$false
# Remove-Item -Path $FullMsiPath -Force -Confirm:$false