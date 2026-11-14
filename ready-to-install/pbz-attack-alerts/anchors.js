"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BodyAnchors = void 0;
const UE = require("ue");
const overlay_1 = require("./overlay");
/** Follow the animated torso rather than an arbitrary point above the capsule. */
class BodyAnchors {
    constructor() {
        this.cache = new WeakMap();
    }
    point(actor, offset) {
        const centre = actor.K2_GetActorLocation();
        try {
            let anchor = this.cache.get(actor);
            if (anchor && !UE.KismetSystemLibrary.IsValid(anchor.mesh)) {
                this.cache.delete(actor);
                anchor = undefined;
            }
            if (anchor === undefined) {
                anchor = null;
                const object = UE.GameplayStatics.ObjectIsA(actor, UE.Character.StaticClass()) ?
                    (0, overlay_1.checked)(actor, UE.Character).Mesh : actor.GetComponentByClass(UE.SkeletalMeshComponent.StaticClass());
                if (object && UE.KismetSystemLibrary.IsValid(object)) {
                    const mesh = (0, overlay_1.checked)(object, UE.SkeletalMeshComponent);
                    let best = '', score = 0;
                    for (let i = 0; i < Math.min(mesh.GetNumBones(), 512); i++) {
                        const bone = mesh.GetBoneName(i), normalized = bone.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const rank = /spine0?3$/.test(normalized) ? 100 : /upperchest$/.test(normalized) ? 95 :
                            /chest$/.test(normalized) ? 90 : /spine0?2$/.test(normalized) ? 80 : /spine0?1$/.test(normalized) ? 60 : /spine$/.test(normalized) ? 50 : 0;
                        if (rank > score) {
                            best = bone;
                            score = rank;
                        }
                    }
                    if (best && mesh.DoesSocketExist(best))
                        anchor = { mesh, bone: best };
                }
                this.cache.set(actor, anchor);
                console.log(`[PBZMOD] pbz-attack-alerts body anchor source=${actor.GetName()} bone=${anchor?.bone ?? 'actor-centre'}`);
            }
            if (anchor) {
                const p = anchor.mesh.GetSocketLocation(anchor.bone);
                if (Number.isFinite(p.X + p.Y + p.Z) && Math.hypot(p.X - centre.X, p.Y - centre.Y, p.Z - centre.Z) < 2000)
                    return new UE.Vector(p.X, p.Y, p.Z + offset);
            }
        }
        catch {
            // A despawning/replaced mesh must not disable confirmed attack alerts.
            this.cache.set(actor, null);
        }
        return new UE.Vector(centre.X, centre.Y, centre.Z + offset);
    }
}
exports.BodyAnchors = BodyAnchors;
