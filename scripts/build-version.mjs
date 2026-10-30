import {execFileSync} from 'node:child_process';

// CLI builds do not necessarily receive Vercel's commit environment variable.
// Prefer an explicit release label, then the actual checkout, never an old date.
export function buildVersion(env=process.env, readCommit=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()) {
 const clean=value=>String(value||'').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,80);
 for(const value of [env.VITE_BUILD_VERSION,env.VERCEL_GIT_COMMIT_SHA]){
  const label=clean(value);if(label)return label;
 }
 try{const commit=String(readCommit()).trim();if(/^[a-f0-9]{40,64}$/i.test(commit))return commit.slice(0,12);}catch{}
 return 'build-unknown';
}
