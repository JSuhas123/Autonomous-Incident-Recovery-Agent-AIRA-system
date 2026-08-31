param(
    [string]$ScriptsDirectory = $PSScriptRoot
)


$ErrorActionPreference = "Stop"


Write-Host ""
Write-Host "==============================================="
Write-Host " AIRA RELIABILITY LAB SCRIPT VALIDATION"
Write-Host "==============================================="
Write-Host ""


$ResolvedDirectory =
    [System.IO.Path]::GetFullPath(
        $ScriptsDirectory
    )


if (
    -not (
        Test-Path `
            -Path $ResolvedDirectory `
            -PathType Container
    )
) {
    throw "Scripts directory does not exist: $ResolvedDirectory"
}


$Scripts =
    @(
        Get-ChildItem `
            -Path $ResolvedDirectory `
            -Filter "*.ps1" `
            -File |
        Sort-Object Name
    )


if (
    $Scripts.Count -eq 0
) {
    throw "No PowerShell scripts were found in $ResolvedDirectory"
}


$Failed =
    $false


foreach (
    $Script
    in $Scripts
) {
    Write-Host "Checking $($Script.Name)..."


    $Tokens = $null
    $ParseErrors = $null


    [System.Management.Automation.Language.Parser]::ParseFile(
        $Script.FullName,
        [ref]$Tokens,
        [ref]$ParseErrors
    ) |
    Out-Null


    if (
        $ParseErrors.Count -gt 0
    ) {
        $Failed = $true


        Write-Host "FAIL"


        foreach (
            $ParseError
            in $ParseErrors
        ) {
            Write-Host ""
            Write-Host " File: $($Script.FullName)"
            Write-Host " Line: $($ParseError.Extent.StartLineNumber)"
            Write-Host " Column: $($ParseError.Extent.StartColumnNumber)"
            Write-Host " Error: $($ParseError.Message)"
            Write-Host ""
        }
    }
    else {
        Write-Host "PASS"
    }
}


if (
    $Failed
) {
    throw "One or more Reliability Lab PowerShell scripts contain syntax errors."
}


Write-Host ""
Write-Host "==============================================="
Write-Host " ALL RELIABILITY LAB SCRIPTS ARE VALID"
Write-Host "==============================================="
Write-Host ""
Write-Host "Validated: $($Scripts.Count) scripts"
Write-Host ""