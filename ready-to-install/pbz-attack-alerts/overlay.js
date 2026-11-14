"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertOverlay = void 0;
exports.isReleasedObjectError = isReleasedObjectError;
exports.isLive = isLive;
exports.checked = checked;
const UE = require("ue");
const flare_assets_1 = require("./flare-assets");
const vector = (x, y) => UE.KismetMathLibrary.MakeVector2D(x, y);
// A released PuerTS wrapper can throw while converting IsValid's argument,
// before Unreal gets a chance to return false. Only that known lifetime error
// is recoverable; missing/unsupported native bindings must remain visible.
function isReleasedObjectError(error) {
    return /passing (?:a|an) invalid object/i.test(String(error));
}
function isLive(value) {
    if (!value)
        return false;
    try {
        return UE.KismetSystemLibrary.IsValid(value);
    }
    catch (error) {
        if (isReleasedObjectError(error))
            return false;
        throw error;
    }
}
function checked(value, cls) {
    if (!isLive(value) || !UE.GameplayStatics.ObjectIsA(value, cls.StaticClass())) {
        throw new Error(`Expected native ${cls.StaticClass().GetName()}`);
    }
    // The runtime class check above establishes this type.
    return value;
}
class AlertOverlay {
    constructor() {
        this.glyphs = [];
        this.textures = [];
    }
    create(owner, count, size) {
        this.destroy();
        try {
            this.textures = [flare_assets_1.flarePng.halo, flare_assets_1.flarePng.ring, flare_assets_1.flarePng.goldEdge, flare_assets_1.flarePng.flare, flare_assets_1.flarePng.core,
                flare_assets_1.flarePng.goldFlare, flare_assets_1.flarePng.goldCore].map(hex => {
                const bytes = UE.NewArray(UE.BuiltinByte);
                const chunk = [];
                for (let i = 0; i < hex.length; i += 2) {
                    chunk.push(parseInt(hex.slice(i, i + 2), 16));
                    if (chunk.length === 256) {
                        bytes.Add(...chunk);
                        chunk.length = 0;
                    }
                }
                if (chunk.length)
                    bytes.Add(...chunk);
                return checked(UE.KismetRenderingLibrary.ImportBufferAsTexture2D(owner, bytes), UE.Texture2D);
            });
            this.viewport = checked(UE.SubsystemBlueprintLibrary.GetEngineSubsystem(UE.GameViewportSubsystem.StaticClass()), UE.GameViewportSubsystem);
            // A transient-package outer has no game world: AddWidget rejects it.
            // SpawnObject supplies an owning controller and the child outer chain.
            const root = this.root = checked(UE.GameplayStatics.SpawnObject(UE.CanvasPanel.StaticClass(), owner), UE.CanvasPanel);
            root.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
            const viewportSlot = this.viewport.GetWidgetSlot(root);
            viewportSlot.Anchors.Minimum = vector(0, 0);
            viewportSlot.Anchors.Maximum = vector(1, 1);
            viewportSlot.Offsets.Left = viewportSlot.Offsets.Top = viewportSlot.Offsets.Right = viewportSlot.Offsets.Bottom = 0;
            viewportSlot.Alignment = vector(0, 0);
            viewportSlot.ZOrder = 90;
            viewportSlot.bAutoRemoveOnWorldRemoved = true;
            if (!this.viewport.AddWidget(root, viewportSlot))
                throw new Error(`Viewport rejected alert overlay; owner=${owner.GetName()} outer=${root.GetOuter()?.GetName()}`);
            for (let index = 0; index < count; index++) {
                const panel = checked(UE.GameplayStatics.SpawnObject(UE.CanvasPanel.StaticClass(), root), UE.CanvasPanel);
                const slot = root.AddChildToCanvas(panel);
                if (!slot)
                    throw new Error('Could not attach glyph');
                slot.SetSize(vector(size, size));
                slot.SetAlignment(vector(0.5, 0.5));
                panel.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
                panel.SetRenderTransformPivot(vector(0.5, 0.5));
                const layers = [];
                for (const texture of this.textures.slice(0, 5)) {
                    const layer = checked(UE.GameplayStatics.SpawnObject(UE.Image.StaticClass(), panel), UE.Image);
                    layer.SetBrushFromTexture(texture, false);
                    layer.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
                    layer.SetRenderTransformPivot(vector(0.5, 0.5));
                    const layerSlot = panel.AddChildToCanvas(layer);
                    if (!layerSlot)
                        throw new Error('Could not attach flare layer');
                    layerSlot.SetAlignment(vector(0.5, 0.5));
                    layerSlot.SetPosition(vector(size / 2, size / 2));
                    layerSlot.SetSize(vector(size, size));
                    layers.push(layer);
                }
                panel.SetRenderOpacity(0);
                this.glyphs.push({ root: panel, slot, layers });
            }
        }
        catch (error) {
            this.destroy();
            throw error;
        }
    }
    get valid() {
        try {
            return isLive(this.root) && isLive(this.viewport) && this.viewport.IsWidgetAdded(this.root);
        }
        catch (error) {
            if (isReleasedObjectError(error))
                return false;
            throw error;
        }
    }
    hide() {
        for (const glyph of this.glyphs)
            if (isLive(glyph.root))
                glyph.root.SetRenderOpacity(0);
    }
    describe() {
        if (!this.root)
            return 'no root';
        const size = UE.SlateBlueprintLibrary.GetLocalSize(this.root.GetCachedGeometry());
        const glyph = this.glyphs[0];
        const child = glyph ? UE.SlateBlueprintLibrary.GetLocalSize(glyph.root.GetCachedGeometry()) : vector(0, 0);
        return `root=${size.X}x${size.Y} glyph=${child.X}x${child.Y}`;
    }
    setColor(glyph, color) {
        if (glyph.color === color)
            return;
        glyph.layers[3].SetBrushFromTexture(this.textures[color === 'yellow' ? 5 : 3], false);
        glyph.layers[4].SetBrushFromTexture(this.textures[color === 'yellow' ? 6 : 4], false);
        glyph.color = color;
    }
    show(index, x, y, color, progress) {
        const glyph = this.glyphs[index];
        if (!glyph || !isLive(glyph.root))
            return;
        this.setColor(glyph, color);
        const t = Math.max(0, Math.min(1, progress));
        const gold = color === 'yellow';
        // Hold yellow at full strength for ~0.13s; duration and peak size are unchanged.
        const opacity = gold ? (t < 0.08 ? 0.85 + 0.15 * t / 0.08 : t < 0.5 ? 1 : Math.pow((1 - t) / 0.5, 0.75)) :
            (t < 0.12 ? 0.65 + 0.35 * t / 0.12 : Math.pow((1 - t) / 0.88, 0.75));
        const scale = t < 0.12 ? 0.62 + 0.54 * t / 0.12 : 1.16 - 0.40 * (t - 0.12) / 0.88;
        glyph.slot.SetPosition(vector(x, y));
        glyph.root.SetRenderScale(vector(scale, scale));
        glyph.root.SetRenderTransformAngle(color === 'red' ? 45 : 10);
        glyph.root.SetRenderOpacity(opacity);
        glyph.layers.forEach((layer, index) => {
            const core = index === 4, edge = index === 2;
            layer.SetColorAndOpacity(edge ? UE.KismetMathLibrary.MakeColor(0.012, 0.006, 0.001, gold ? 0.55 : 0) :
                UE.KismetMathLibrary.MakeColor(1, core ? 1 : gold ? 0.72 : 0.035, core ? 0.89 : gold ? 0.025 : 0.055, index === 0 ? (gold ? 1 : 0.80) : index === 1 ? 0.45 * (1 - t) : 1));
            const layerScale = index === 1 ? 0.55 + t * 1.10 : index === 0 ? 1 + t * 0.20 : 1;
            layer.SetRenderScale(vector(layerScale, layerScale));
        });
    }
    prepare(index, x, y, color, progress) {
        const glyph = this.glyphs[index];
        if (!glyph || !isLive(glyph.root))
            return;
        this.setColor(glyph, color);
        const t = Math.max(0, Math.min(1, progress));
        const gold = color === 'yellow';
        glyph.slot.SetPosition(vector(x, y));
        glyph.root.SetRenderScale(vector(1, 1));
        glyph.root.SetRenderTransformAngle(color === 'red' ? 45 : 10);
        glyph.root.SetRenderOpacity(gold ? 0.82 + 0.16 * t : 0.65 + 0.25 * t);
        glyph.layers.forEach((layer, index) => {
            const edge = index === 2;
            const alpha = index === 1 ? (gold ? 0.85 : 0.70) : index === 0 ? 0.10 + 0.12 * t : index === 3 ? (gold ? 0.35 + 0.20 * t : 0.18 + 0.15 * t) : 0;
            layer.SetColorAndOpacity(edge ? UE.KismetMathLibrary.MakeColor(0.012, 0.006, 0.001, gold ? 0.28 : 0) :
                UE.KismetMathLibrary.MakeColor(1, gold ? 0.72 : 0.035, gold ? 0.025 : 0.055, alpha));
            const scale = index === 1 ? 1.25 - 0.60 * t : 0.55 + 0.15 * t;
            layer.SetRenderScale(vector(scale, scale));
        });
    }
    destroy() {
        // Forget the old world first, even when native teardown has already run.
        // Cleanup is idempotent and must never interrupt reset() or loader stop().
        const root = this.root, viewport = this.viewport;
        this.glyphs = [];
        this.textures = [];
        this.root = undefined;
        this.viewport = undefined;
        try {
            if (isLive(root)) {
                if (isLive(viewport))
                    viewport.RemoveWidget(root);
                else
                    root.RemoveFromParent();
            }
        }
        catch (error) {
            if (!isReleasedObjectError(error))
                console.error(`[PBZMOD] pbz-attack-alerts overlay cleanup: ${String(error)}`);
        }
    }
}
exports.AlertOverlay = AlertOverlay;
