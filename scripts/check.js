const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),skip=new Set(['node_modules','.git']),files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(entry.name))continue;let file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.js'))files.push(file)}}
walk(root);for(const file of files){let r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr||`Syntax check failed: ${file}`);process.exit(r.status||1)}}
for(const file of ['index.html','styles.css','stage2.css','stage3.css','mock/seed-data.js','prisma/schema.prisma','robots.txt','sitemap.xml','vercel.json'])if(!fs.existsSync(path.join(root,file))){console.error(`Required project file missing: ${file}`);process.exit(1)}
try{const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));if(!Array.isArray(config.rewrites)||!config.rewrites.some(x=>x.destination==='/index.html'))throw new Error('Vercel SPA rewrite missing')}catch(error){console.error(`Invalid Vercel configuration: ${error.message}`);process.exit(1)}
console.log(`Build check passed: ${files.length} JavaScript files + required assets and Vercel configuration`);
