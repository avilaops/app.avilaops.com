import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base=process.env.BASE ?? "http://localhost:3217";
const out=process.env.SAIDA ?? "./output/playwright/interacoes";
await mkdir(out,{recursive:true});
const token=(await readFile(process.env.TOKEN_FILE ?? './output/playwright/token.txt','utf8')).trim();
const browser=await chromium.launch({executablePath:'C:/Users/nicol/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR'});
await ctx.addCookies([{name:'avila_ops_session',value:token,domain:'localhost',path:'/'}]);
await ctx.addInitScript(()=>localStorage.setItem('avilaops-tema',JSON.stringify({tema:'dark',ate:Date.now()+86400000})));
const p=await ctx.newPage();const checks=[];
const foto=nome=>p.screenshot({path:`${out}/${nome}.png`});
try {
 await p.goto(base+'/financeiro',{waitUntil:'networkidle'});
 await p.getByRole('combobox',{name:'Escolher conta'}).click();
 await p.getByPlaceholder('Buscar conta').fill('EUR');
 await foto('conta-busca');
 await p.getByRole('option').filter({hasText:'EUR'}).click();
 await p.waitForURL(/conta=wise-eur/);await p.waitForLoadState('networkidle');
 assert.match(await p.locator('main').innerText(),/Saldo indisponível/);
 assert.match(await p.locator('main').innerText(),/€/);
 checks.push('Wise EUR: busca, troca de moeda e saldo indisponível.');await foto('wise-eur');
 await p.getByRole('button',{name:/^Revisar /}).first().click();
 const dialog=p.getByRole('dialog');await dialog.waitFor();await p.keyboard.press('Tab');
 assert(await dialog.evaluate(el=>el.contains(document.activeElement)));
 await foto('revisao');
 await p.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:480});window.visualViewport.dispatchEvent(new Event('resize'));});
 await p.waitForTimeout(300);
 const salvar=dialog.getByRole('button',{name:'Salvar',exact:true});
 assert(await salvar.isVisible());const b=await salvar.boundingBox();assert(b&&b.y>=0&&b.y+b.height<=480);
 await foto('teclado-simulado');await p.keyboard.press('Escape');assert.equal(await dialog.count(),0);
 checks.push('Modal: foco contido, Escape e rodapé com viewport reduzida (teclado simulado).');
 await p.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
 await p.goto(base+'/financeiro?conta=cartao-assai&range=30',{waitUntil:'networkidle'});
 assert.equal(await p.getByRole('button',{name:/^Revisar /}).count(),0);
 await foto('lista-vazia');checks.push('Conta sem movimentações: estado vazio, sem saldo inventado.');
 await p.goto(base+'/financeiro/importar',{waitUntil:'networkidle'});
 let liberar;
 await p.route('**/api/integrations/wise/import',async route=>{await new Promise(r=>{liberar=r;});await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Arquivo de teste inválido. Confira as colunas do CSV.'})});});
 await p.locator('input[type=file]').setInputFiles({name:'teste.csv',mimeType:'text/csv',buffer:Buffer.from('invalido\nexemplo')});
 await p.getByRole('button',{name:'Importando…'}).waitFor();assert(await p.getByRole('button',{name:'Importando…'}).isDisabled());
 while(!liberar)await p.waitForTimeout(50);liberar();await p.getByRole('alert').waitFor();await foto('importacao-erro');
 assert(await p.getByRole('button',{name:'Escolher arquivo'}).isEnabled());checks.push('Importação simulada: carregamento, desabilitado, erro e recuperação.');
 await p.goto(base+'/financeiro/contas',{waitUntil:'networkidle'});
 let tentativa=0;
 await p.route('**/api/ledger-entries/*',async route=>{tentativa++;await new Promise(r=>setTimeout(r,400));await route.fulfill({status:tentativa===1?400:200,contentType:'application/json',body:JSON.stringify(tentativa===1?{error:'Falha simulada. Tente novamente.'}:{})});});
 const baixa=p.getByRole('button',{name:'Dar baixa',exact:true}).first();
 await baixa.click();assert(await baixa.isDisabled());await p.getByRole('alert').waitFor();await foto('baixa-erro');
 await baixa.click();await p.getByText('Lançamento atualizado.',{exact:true}).waitFor();await foto('baixa-sucesso');
 checks.push('Dar baixa: desabilitado, erro e sucesso com HTTP interceptado, sem gravar baixa.');
 await p.goto(base+'/financeiro/mercadopago',{waitUntil:'networkidle'});
 assert.match(await p.locator('main').innerText(),/Assinatura cancelada no Mercado Pago/);assert.doesNotMatch(await p.locator('main').innerText(),/vale cancelar/);
 await foto('assinatura-cancelada');checks.push('Cancelada não recomenda cancelar novamente.');
 for(const rota of ['/mais','/mais/hub-social']){
  await p.goto(base+rota,{waitUntil:'networkidle'});const imgs=p.locator('img[src^="/icones-3d/"]:visible');
  assert(await imgs.count()>=5);
  for(const img of await imgs.all()){await img.scrollIntoViewIfNeeded();await img.evaluate(i=>i.decode());}
  assert(await imgs.evaluateAll(xs=>xs.every(i=>i.complete&&i.naturalWidth>0)));
  await p.evaluate(()=>window.scrollTo(0,0));
  assert(await p.locator('img[src*="hub-social.png"]').count()>0);await foto(rota.replaceAll('/','-').slice(1));
 }
 checks.push('Menus: imagens carregadas e novo Hub Social.');
 await writeFile(out+'/resultado.json',JSON.stringify({checks,fonte:'Build local, banco descartável e mocks. Sem operações reais.'},null,2));console.log(checks);
}finally{await browser.close();}

