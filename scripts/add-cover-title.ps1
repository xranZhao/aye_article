# 在无字公众号封面上后叠加可修改的中文标题。
param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$Title,
    [string]$Subtitle = ""
)

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $InputPath))
$canvas = [System.Drawing.Bitmap]::new($source.Width, $source.Height)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)

$padding = [Math]::Round($source.Width * 0.07)
$titleSize = [Math]::Max(42, [Math]::Round($source.Height * 0.18))
$titleFont = [System.Drawing.Font]::new('Source Han Serif CN Heavy', $titleSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = [System.Drawing.Font]::new('Source Han Serif CN', [Math]::Max(20, [Math]::Round($source.Height * 0.055)), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter

$titleHeight = [Math]::Ceiling($graphics.MeasureString($Title, $titleFont).Height)
$subtitleHeight = 0
if ($Subtitle) {
    $subtitleHeight = [Math]::Ceiling($graphics.MeasureString($Subtitle, $subtitleFont).Height) + 14
}
$top = $source.Height - $padding - $titleHeight - $subtitleHeight
$shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(105, 0, 0, 0))
$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)

$graphics.DrawString($Title, $titleFont, $shadow, $padding + 3, $top + 4, $format)
$graphics.DrawString($Title, $titleFont, $white, $padding, $top, $format)
if ($Subtitle) {
    $subTop = $top + $titleHeight + 8
    $graphics.DrawString($Subtitle, $subtitleFont, $shadow, $padding + 2, $subTop + 2, $format)
    $graphics.DrawString($Subtitle, $subtitleFont, $white, $padding, $subTop, $format)
}

$outDir = Split-Path -Parent $OutputPath
if ($outDir) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
$canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$white.Dispose(); $shadow.Dispose(); $titleFont.Dispose(); $subtitleFont.Dispose(); $format.Dispose()
$graphics.Dispose(); $canvas.Dispose(); $source.Dispose()
