// Exact exception for the reviewed V34 series. Read-only Git; no network or policy bypass.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const POLICY={
  "baseCommit": "3284d4fa3345a6cb49188c740ee5e5a3cf2bccf1",
  "baseTree": "fec1c744c5f05d952cce856b5c6a1be89a86cebb",
  "acceptedHead": "bb5fd83e4c810a2d88e85d1245a304416e4a30b1",
  "acceptedProjectedTree": "4964d777dfeb6fd084d72c2893ea06114759f11e",
  "product": {
    "assets/03-triovist-routes.js": {
      "before": {
        "mode": "100644",
        "oid": "5c6921726e79f4511803b0b2202e963c42852864"
      },
      "after": {
        "mode": "100644",
        "oid": "f79cb3d0d32183ae8ab8dcb667a8ce2fdf20eb60"
      },
      "before_sha256": "1bb9efda768afcb590c95cbd3d52acdc69ee9fdbd13ee7e478ad49d9d124eed2",
      "after_sha256": "20c36f7a0dc8c17db337b29d7f182f9904008696c5cb78c0ee8d4014b930a726"
    },
    "index.html": {
      "before": {
        "mode": "100644",
        "oid": "7a3157f3cfc5793825708d353065053aee7153f2"
      },
      "after": {
        "mode": "100644",
        "oid": "346a0dc0d6dda3101857da13161d19553e7cf14f"
      },
      "before_sha256": "2ed36bfc771916eb41e94719ef9f4023f88ad8726f2b883f2adb7bae69bd9122",
      "after_sha256": "158c3cd3c3015804a5fc784a413d1f5053c85a897323a74438d244cbf4949eb8"
    },
    "tests/crm-release-guard-v1.test.mjs": {
      "before": {
        "mode": "100644",
        "oid": "b35ca22f709086545b1f977830343676ce8cf741"
      },
      "after": {
        "mode": "100644",
        "oid": "67e87939bdbb8f00a35b3df81da92a58c600525f"
      },
      "before_sha256": "b6d9a47c67f5a2491de518bb71cfa1ed854358e6b9fa22fdf5b7683e7a4b93a1",
      "after_sha256": "f6a974492a16c4f77e5005627d7fbc908ac0be1fadf06393a2f8024282346d97"
    },
    "tests/fixtures/v34-auth-source.json": {
      "before": null,
      "after": {
        "mode": "100644",
        "oid": "5bf8bfbf5f0d38b9afa5ca3bea538facc71208cc"
      },
      "before_sha256": null,
      "after_sha256": "f186d4ec2a95679b65f0cd1de83d70b2844822fed4ab3278c1fe280f195ea4a2"
    },
    "tests/roman-functional-fixes-v1.test.mjs": {
      "before": {
        "mode": "100644",
        "oid": "2dc61b9ff30e3b9adf111b6e7d5e1bbc85a68e30"
      },
      "after": {
        "mode": "100644",
        "oid": "534044f2a2d55a24142af2e6452f2abd969d575d"
      },
      "before_sha256": "ad2aa62c3f024b665a7cea98b3fd64c4a3aac6a572884685b9178632972d0cd8",
      "after_sha256": "c395c14c7a078fb7bce12b68433c03b665f6f9d284ff597733786557a07a10c6"
    },
    "tests/triovist-stock-director-v1.test.mjs": {
      "before": {
        "mode": "100644",
        "oid": "bf133880561ddb5f26f411398c2249a7d8ee560e"
      },
      "after": {
        "mode": "100644",
        "oid": "0c64ed892da1bb443c1ad15593c91a65e03e2285"
      },
      "before_sha256": "c479b39862d493a42993dea1baaf4cc2c9904eb32090e077708ee1521d048934",
      "after_sha256": "8fa6a24c23cb30333c42c15d666fab635932a319cf3477527e8d63939b79d1ee"
    },
    "tests/v34-01-falling-receipt.test.mjs": {
      "before": null,
      "after": {
        "mode": "100644",
        "oid": "89fe8e5d7c37f03213cad5186164cf1dbbb25572"
      },
      "before_sha256": null,
      "after_sha256": "9e46b615dba9250ebb4d6d3a7f5fd6b801f68f93dd194572b744fe633709b786"
    },
    "tests/v34-01-receipt-lifecycle.test.mjs": {
      "before": null,
      "after": {
        "mode": "100644",
        "oid": "504842df7a6c3c90e0e7e92805f186454ec17ff4"
      },
      "before_sha256": null,
      "after_sha256": "45d150f104ccfb7aa839d5c3c92ba777f17cfd3f670b9dcb92250331a180ea7b"
    }
  },
  "ciFixed": {
    "tests/route-change-scope-v1.mjs": {
      "before": {
        "mode": "100644",
        "oid": "8522f22b0e238eef819ba484976c45148d6842c8"
      },
      "after": {
        "mode": "100644",
        "oid": "39371bf102c71c022a04895b32a198cd23286d99"
      }
    },
    ".github/workflows/triovist-brainstorm-subgroups-v2.yml": {
      "before": {
        "mode": "100644",
        "oid": "64e421cd0922aca8bfae94c0254c5807139c4e67"
      },
      "after": {
        "mode": "100644",
        "oid": "995a447bbd9f013e0f6dbfb4ace85659d18c9bb3"
      }
    },
    ".github/workflows/gps360-complete-one-time-geo-v1.yml": {
      "before": {
        "mode": "100644",
        "oid": "e9acd15a50197cf8bda476ada317c03bca9ff05a"
      },
      "after": {
        "mode": "100644",
        "oid": "9f1ec20a9c3b55fda5fffbe8e5653c31fa4ff6b9"
      }
    },
    ".github/workflows/gps-director360-evidence-v1.yml": {
      "before": {
        "mode": "100644",
        "oid": "dbefa4c07b38d711bfbe5e07780f9f48e62262d1"
      },
      "after": {
        "mode": "100644",
        "oid": "6f69d20dda6fee4cc7eeaa23dc62532237ee03ee"
      }
    }
  },
  "newCiFiles": [
    "tests/v34-accepted-series-scope-v1.mjs",
    "tests/v34-accepted-series-scope-v1.test.mjs"
  ],
  "ciPaths": [
    ".github/workflows/gps-director360-evidence-v1.yml",
    ".github/workflows/gps360-complete-one-time-geo-v1.yml",
    ".github/workflows/triovist-brainstorm-subgroups-v2.yml",
    "tests/route-change-scope-v1.mjs",
    "tests/v34-accepted-series-scope-v1.mjs",
    "tests/v34-accepted-series-scope-v1.test.mjs"
  ]
};
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export function treeId(entries){
 const root=new Map();
 for(const [name,entry] of Object.entries(entries)){
  assert.ok(!name.startsWith('/')&&!name.split('/').some(x=>!x||x==='.'||x==='..'));
  assert.match(entry.oid,/^[a-f0-9]{40}$/);assert.match(entry.mode,/^(100644|100755|120000|160000)$/);
  const parts=name.split('/');let node=root;
  for(const part of parts.slice(0,-1)){if(!node.has(part))node.set(part,new Map());node=node.get(part);assert.ok(node instanceof Map);}
  assert.ok(!node.has(parts.at(-1)));node.set(parts.at(-1),entry);
 }
 const build=node=>{
  const values=[...node].map(([name,value])=>({name,directory:value instanceof Map,mode:value instanceof Map?'40000':value.mode,oid:value instanceof Map?build(value):value.oid}));
  values.sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.directory?'/':'')),Buffer.from(b.name+(b.directory?'/':''))));
  const raw=Buffer.concat(values.map(x=>Buffer.concat([Buffer.from(x.mode+' '+x.name+'\0'),Buffer.from(x.oid,'hex')])));
  return createHash('sha1').update(Buffer.from('tree '+raw.length+'\0')).update(raw).digest('hex');
 };
 return build(root);
}
export function verifySnapshot(snapshot){
 assert.equal(snapshot.base.id,POLICY.baseCommit,'Unreviewed/current base commit');
 assert.equal(snapshot.base.tree,POLICY.baseTree,'Base tree differs from reviewed reconstruction');
 assert.equal(treeId(snapshot.base.entries),snapshot.base.tree,'Base tree/entries mismatch');
 assert.equal(treeId(snapshot.head.entries),snapshot.head.tree,'Head tree/entries mismatch');
 assert.equal(snapshot.trackedDirty,false,'Tracked worktree/index differs from HEAD');
 const before=snapshot.base.entries,after=snapshot.head.entries;
 const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(p=>!same(before[p],after[p])).sort();
 const required=[...Object.keys(POLICY.product),...POLICY.ciPaths].sort();
 assert.deepEqual(changed,required,'Unexpected/missing changed path; no broad 03/index allowance');
 for(const [p,expected] of Object.entries(POLICY.product)){
  assert.ok(same(before[p],expected.before),'Unreviewed before '+p);
  assert.ok(same(after[p],expected.after),'Unreviewed product bytes/mode '+p);
 }
 for(const [p,expected] of Object.entries(POLICY.ciFixed)){
  assert.ok(same(before[p],expected.before),'Unreviewed CI base '+p);
  assert.ok(same(after[p],expected.after),'Unexpected workflow/legacy guard edit '+p);
 }
 for(const p of POLICY.newCiFiles){assert.equal(before[p],undefined);assert.equal(after[p]?.mode,'100644');assert.match(after[p]?.oid||'',/^[a-f0-9]{40}$/);}
 const projected={...after};
 for(const p of POLICY.ciPaths){if(before[p])projected[p]=before[p];else delete projected[p];}
 assert.equal(treeId(projected),POLICY.acceptedProjectedTree,'Projected full tree differs from accepted integrated project');
 return {status:'EXACT_V34_SCOPE_VERIFIED',base:snapshot.base.id,head:snapshot.head.id,baseTree:snapshot.base.tree,headTree:snapshot.head.tree,projectedTree:treeId(projected),allowedFilteredPath:'assets/03-triovist-routes.js',changedPaths:changed};
}
export function collectGitSnapshot(baseRef='origin/main',headRef='HEAD'){
 const git=(...args)=>execFileSync('git',args,{stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
 const resolve=ref=>{assert.ok(!ref.startsWith('-'));return git('rev-parse','--verify',ref+'^{commit}').toString().trim();};
 const base=resolve(baseRef),head=resolve(headRef);assert.equal(base,POLICY.baseCommit,'Current base is not reviewed 3284');
 const parse=ref=>{
  const entries={};
  for(const row of git('ls-tree','-r','-z',ref).toString().split('\0').filter(Boolean)){
   const match=/^(\d+) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(row);assert.ok(match,'Malformed Git tree');
   const [,mode,,oid,name]=match;assert.equal(entries[name],undefined);entries[name]={mode,oid};
  }
  return {id:ref,tree:git('rev-parse',ref+'^{tree}').toString().trim(),entries};
 };
 git('merge-base','--is-ancestor',base,head);
 const trackedDirty=git('diff','--name-only').length>0||git('diff','--cached','--name-only').length>0;
 return {base:parse(base),head:parse(head),trackedDirty};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);let base='origin/main',head='HEAD';
  while(args.length){const flag=args.shift(),value=args.shift();assert.ok(value);if(flag==='--base')base=value;else if(flag==='--head')head=value;else throw Error('Unknown argument '+flag);}
  console.log(JSON.stringify(verifySnapshot(collectGitSnapshot(base,head)),null,2));
 }catch(error){console.error('V34 exact exception unavailable: '+String(error.message||error));process.exitCode=1;}
}
