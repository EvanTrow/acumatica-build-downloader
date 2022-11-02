# Example: .\Extract-MSI.ps1 -MSIPath "C:\Users\etemplin\OneDrive - Crestwood Associates LLC\Downloads\AcumaticaERPInstall.msi" -TargetDir "D:\Source\Acumatica\21.118.0038\" -UseLessMSI $true
[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position=0)]
    [ValidateNotNullOrEmpty()]
    [ValidateScript({Test-Path $_})]
    [ValidateScript({$_.EndsWith(".msi")})]
    [String] $MsiPath,

    [Parameter(Mandatory=$false, Position=1)]
    [String] $TargetDirectory,

    [Parameter(Mandatory=$false, Position=2)]
    [bool] $UseLessMSI,

    [Parameter(Mandatory=$false, Position=3)]
    [String] $LessMSIPath
)

if(-not($TargetDirectory))
{
    $currentDir = [System.IO.Path]::GetDirectoryName($MsiPath)
    Write-Warning "A target directory is not specified. The contents of the MSI will be extracted to the location, $currentDir\Temp"
    $TargetDirectory = Join-Path $currentDir "Temp"
}

if(-not($UseLessMSI)) {
    $MsiPath = Resolve-Path $MsiPath
    Write-Verbose "Extracting the contents of $MsiPath to $TargetDirectory"
    Start-Process "MSIEXEC" -ArgumentList "/a $MsiPath /qn TARGETDIR=$TargetDirectory" -Wait -NoNewWindow
} else {
    if(-not($LessMSIPath))
    {
        $LessMSIPath = "$($LessMSIPath)\lessmsi\lessmsi.exe"
    }

    $ArgumentList = -join("x ", "`"$MSIPath`"", " ", "`"$TargetDirectory`"");
    # Start-Process "$LessMSIPath x $MsiPath $TargetDirectory"
    # [System.Diagnostics.Process]::Start($LessMSIPath, $ArgumentList)
    Write-Verbose "$ArgumentList"
    Invoke-Expression "& `"$LessMSIPath`" $ArgumentList"
}
