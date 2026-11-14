const { test }=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const observations=require('../dist/pbz-attack-alerts/observations');
function fixture() {
    const logs=[];
    const list=items=>({Num:()=>items.length,Get:i=>items[i]});
    const empty=list([]), UE={};
    for(const kind of ['Pawn','AIController','AbilitySystemComponent','LegoAbility','LGATask_PlayTimeline','AbilityTask','LGAAction_DurationBulletWithDeflectBase']) UE[kind]={StaticClass:()=>({kind})};
    const obj=(kind,name,props={})=>({kind,GetName:()=>name,...props});
    const isA=(v,cls)=>v.kind===cls.kind || v.kind==='LGATask_PlayTimeline' && cls.kind==='AbilityTask';
    const action=obj('LGAAction_DurationBulletWithDeflectBase','strike',{DeflectBulletType:1,ActivationRequirements:{}});
    const ability=obj('LegoAbility','ability',{bIsActive:true,GetPlayTimelineTask:()=>task,ActiveTasks:empty});
    const task=obj('LGATask_PlayTimeline','task',{CurrentTime:.5,Ability:ability,Timeline:obj('timeline','main',{Actions:list([{StartTime:1,Duration:.3,Action:action}])})});
    const asc=obj('AbilitySystemComponent','asc',{TickingTasks:list([task]),ActivatableAbilities:{Items:empty}});
    const player=obj('Pawn','player',{K2_GetActorLocation:()=>({X:0,Y:0,Z:0})});
    const control={target:player,distance:200,forward:-1,tags:true,ignored:false,query:true};
    const enemy=obj('Pawn','enemy',{Controller:obj('AIController','controller'),GetComponentByClass:()=>asc,
        K2_GetActorLocation:()=>({X:control.distance,Y:0,Z:0}),GetActorForwardVector:()=>({X:control.forward,Y:0,Z:0})});
    Object.assign(UE,{
        NewArray:()=>empty,GameplayStatics:{ObjectIsA:isA,GetAllActorsOfClass:(_gi,_type,out)=>{out.value=list([enemy]);}},
        KismetSystemLibrary:{IsValid:v=>!!v,GetPathName:v=>v.GetName()},
        SGameAIFunctionLibrary:{GetTargetActor:(_c,out)=>{out.value=control.target;return !!control.target;}},
        BlueprintGameplayTagLibrary:{Conv_ObjectToGameplayTagAssetInterface:()=>asc,HasAllMatchingGameplayTags:()=>control.tags,
            HasAnyMatchingGameplayTags:()=>control.ignored,IsTagQueryEmpty:()=>false,GetOwnedGameplayTags:()=>({}),DoesContainerMatchTagQuery:()=>control.query}
    });
    const mod={exports:{}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/pbz-attack-alerts/windup'),'utf8'),{
        exports:mod.exports,module:mod,console:{log:s=>logs.push(s),error:s=>logs.push(s)},
        require:id=>id==='ue'?UE:id==='puerts'?{$ref:value=>({value}),$unref:r=>r.value}:id==='./observations'?observations:{checked:(v,type)=>{assert.ok(isA(v,type.StaticClass()));return v;}}
    });
    const tracker=new mod.exports.WindupTracker();
    return {control,task,action,ability,logs,tracker,tick:(now,cursor)=>{task.CurrentTime=cursor;return tracker.update({},player,now,.26);}};
}
test('preparation precedes native node activation and confirmation consumes it without repeating',()=>{
    const f=fixture(); assert.equal(f.tick(1,.5).length,0);
    const cues=f.tick(1.3,.8); assert.equal(cues.length,1);
    f.tracker.shown(cues[0].actionKey,1.3);
    f.tracker.confirm(f.action,1.5,1.8);
    assert.equal(f.tick(1.5,1).length,0);
    assert.ok(f.logs.some(s=>s.includes('advance=0.200 totalLead=0.500')));
});
test('off-target, distant and rear-facing enemies never produce a windup cue',()=>{
    for(const patch of [{target:null},{target:{}},{distance:800},{forward:1}]){
        const f=fixture();Object.assign(f.control,patch);assert.equal(f.tick(1,.8).length,0);
    }
});
test('tag-conditioned branches must pass every read-only eligibility check',()=>{
    for(const patch of [{tags:false},{ignored:true},{query:false}]){
        const f=fixture();Object.assign(f.control,patch);assert.equal(f.tick(1,.8).length,0);
    }
});
test('interrupted abilities and stopped timeline clocks clear the preparation',()=>{
    const f=fixture();assert.equal(f.tick(1,.8).length,1);
    assert.equal(f.tick(1.1,.8).length,0);
    f.ability.bIsAbilityEnding=true;assert.equal(f.tick(1.2,.9).length,0);
});
test('slowed timeline uses its measured rate instead of promising a fixed impact countdown',()=>{
    const f=fixture();assert.equal(f.tick(1,.5).length,0);
    assert.equal(f.tick(1.5,.75).length,0,'0.25 timeline seconds at half speed is outside the 0.26s window');
    assert.equal(f.tick(1.8,.9).length,1);
});
test('red-only attack types and blue parryable types preserve the requested mapping',()=>{
    for(const [kind,color] of [[0,'red'],[1,'yellow'],[2,'yellow'],[3,'red'],[4,'red'],[5,'yellow']]){
        const f=fixture();f.action.DeflectBulletType=kind;assert.equal(f.tick(1,.8)[0].color,color);
    }
});
