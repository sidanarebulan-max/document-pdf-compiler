const fs=require('node:fs'),path=require('node:path');
module.exports=async(route,url)=>{
 if(!url.hostname.endsWith('.test')||!/^\/assets\/(?:faris-(?:appearance|glass)\.(?:css|js)|ios-tokens\.css)$/.test(url.pathname))return false;
 const file=path.join(process.cwd(),url.pathname.slice(1));await route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});return true;
};
