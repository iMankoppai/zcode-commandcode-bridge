@echo off
rem Show cmdgo-bridge status: health, account pool, model count.
setlocal
if "%CMDGO_PORT%"=="" set "CMDGO_PORT=11435"
node -e "const P=process.env.CMDGO_PORT||'11435';fetch('http://127.0.0.1:'+P+'/health').then(r=>r.json()).then(async h=>{console.log('[health] ok='+h.ok+' models='+h.models+' accounts='+h.accounts+' active='+h.activeAccounts);const s=await (await fetch('http://127.0.0.1:'+P+'/api/status')).json();(s.accounts||[]).forEach(a=>console.log('  account '+a.userName+' keyName='+a.keyName+' cooling='+a.cooling+' failCount='+a.failCount));}).catch(e=>console.log('[offline] cannot reach the bridge on 127.0.0.1:'+P+' -> '+e.message))"
echo.
pause
