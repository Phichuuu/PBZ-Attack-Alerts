// Optional: add declarations for extra APIs you have verified in your game build.
// The shared UE/PuerTS/global declarations come from @pbz-mod-loader/game-api.
// Use `declare module 'ue' { ... }` to extend them without copying the SDK.
declare module 'ue' {
    // Tencent/puerts uelazyload.js translateType/NewArray accept native class tokens.
    // https://github.com/Tencent/puerts/blob/master/unreal/Puerts/Content/JavaScript/puerts/uelazyload.js
    export function NewArray<T extends Object>(type: $ClassType<T>): TArray<T | null | undefined>;
}
