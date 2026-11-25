#!/usr/bin/env python3
"""Optional isolated Chromium DOM/layout smoke test; synthetic data only.

Run: python3 tools/mesh_dashboard_smoke.py --chromium /usr/bin/chromium
Requires optional playwright and a Chromium executable. No live network, RF,
MapLibre tiles, actual messaging transport, or server is used.
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]/'openrf'/'static'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium',default='/usr/bin/chromium')
    parser.add_argument('--screenshot',type=Path)
    args=parser.parse_args()
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script\s*>','',html,flags=re.I|re.S)
    html=re.sub(r'<link\b[^>]*>','',html,flags=re.I)
    html=html.replace('</head>','<style>'+(ROOT/'app.css').read_text()+'</style></head>',1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.chromium,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1280,'height':800},has_touch=True)
        errors=[]; page.on('pageerror',lambda err:errors.append(str(err)))
        page.route('**/*',lambda route:route.abort())
        page.set_content(html,wait_until='domcontentloaded')
        page.evaluate('''() => {
            document.querySelectorAll('.page').forEach(e=>e.classList.remove('active'));
            document.getElementById('page-mesh-network').classList.add('active');
            const now=Date.now()/1000;
            const nodes=Array.from({length:120},(_,i)=>({protocol:'Meshtastic',id:'!'+i.toString(16).padStart(8,'0'),name:'TEST fixture '+String(i).padStart(3,'0'),role:'CLIENT',source:'RADIO_NODE_DATABASE',quality:'Synthetic test only',last_heard:now,position:i===0?{latitude:38,longitude:-120,source:'TEST'}:null,telemetry:{'RSSI (dBm)':-80},infrastructure:false}));
            window.fixture={nodes,networks:['Meshtastic','MeshCore','Reticulum'].map(protocol=>({protocol,state:'Synthetic fixture',count:protocol==='Meshtastic'?120:0})),topology:[],snapshot_at:now,history_settings:{enabled:false,background_enabled:false,days:30,interval_seconds:30},history_usage:{samples:0,max_rows:100000,file_bytes:32768,target_bytes:67108864},collector:{outcome:'idle',failed_protocols:[]}};
            window.requestLog=[]; window.conversations=[];
            window.fetch=async (path,opts={})=>{
              requestLog.push([path,opts.method||'GET']);
              if(path.includes('/history?'))return new Response(JSON.stringify({count:1,first_saved:now,last_saved:now,samples:[{captured:now,source:'TEST',telemetry:{'RSSI (dBm)':-80}}]}));
              if(path.endsWith('/history/settings')){fixture.history_settings=JSON.parse(opts.body);return new Response('{}');}
              if(path.endsWith('/history/clear')){fixture.history_settings.enabled=false;fixture.history_settings.background_enabled=false;return new Response('{}');}
              if(path==='/api/mesh/dashboard')return new Response(JSON.stringify(fixture));
              return new Response('{}',{status:404});
            };
            document.addEventListener('openrf:mesh-node-conversation',e=>conversations.push(e.detail));
            document.querySelectorAll('.nav-btn[data-page]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.page').forEach(e=>e.classList.remove('active'));document.getElementById('page-'+btn.dataset.page)?.classList.add('active');}));
        }''')
        page.add_script_tag(content=(ROOT/'mesh-dashboard.js').read_text())
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded')); document.dispatchEvent(new Event('openrf:mesh-network-shown'))")
        page.wait_for_function("document.getElementById('mesh-network-count').textContent.includes('120 matching')")
        assert page.locator('#mesh-network-rows tr').count()==50
        assert page.locator('#mesh-network-overview').bounding_box()['y'] < page.locator('#mesh-network-search').bounding_box()['y']
        assert page.locator('#mesh-network-refresh').bounding_box()['height']>=44
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
        if args.screenshot:page.screenshot(path=str(args.screenshot))
        page.locator('#mesh-network-next').click(); assert page.locator('#mesh-network-page').inner_text()=='Page 2 of 3'
        page.locator('#mesh-network-next').click(); assert page.locator('#mesh-network-rows tr').count()==20
        page.locator('#mesh-network-search').fill('TEST fixture 000');assert page.locator('#mesh-network-page').inner_text()=='Page 1 of 1'
        page.get_by_role('button',name='TEST fixture 000',exact=True).click()
        page.get_by_role('button',name='Load / refresh node history',exact=True).click();page.wait_for_selector('[data-node-history] canvas')
        page.evaluate("fixture.nodes[0].telemetry['RSSI (dBm)']=-81")
        page.locator('#mesh-network-refresh').click();page.wait_for_function("document.getElementById('mesh-network-detail').innerText.includes('-81')")
        assert page.locator('[data-node-history] canvas').count()==1
        page.get_by_role('button',name='Open node conversation / history',exact=True).click();assert page.evaluate('conversations[0].id')=='!00000000'
        page.evaluate("document.querySelector('[data-page=mesh-network]').click()")
        page.locator('#mesh-network-search').fill('no such fixture');assert 'No matching nodes' in page.locator('#mesh-network-rows').inner_text()
        page.locator('#mesh-network-search').fill('')
        # Real raster adapter and a test-only vector marker implementation.
        assert page.evaluate('''() => { const layer=document.querySelector('[data-mesh-layer="Meshtastic"]');layer.checked=true;const parent=document.createElement('div');document.body.append(parent);OpenRFMeshDashboard.raster(parent,{center:[-120,38],zoom:4},400,300,(lon,lat,z)=>[lon*10,lat*10]);const ok=parent.querySelectorAll('.mesh-network-pin').length===1;parent.remove();layer.checked=false;return ok;}''')
        assert page.evaluate('''() => {let active=0;window.maplibregl={Marker:class {constructor(x){this.x=x;} setLngLat(x){return this;} addTo(x){active++;return this;} remove(){active--;}}};const layer=document.querySelector('[data-mesh-layer="Meshtastic"]'),map={};layer.checked=true;OpenRFMeshDashboard.vector(map);const ok=active===1;layer.checked=false;OpenRFMeshDashboard.vector(map);return ok&&active===0;}''')
        page.get_by_text('Local node history & recording settings',exact=True).click();page.locator('#mesh-history-enabled').check();page.locator('#mesh-history-background').check();page.locator('#mesh-history-save').click();page.wait_for_function('fixture.history_settings.background_enabled===true')
        page.once('dialog',lambda dialog:dialog.accept());page.locator('#mesh-history-clear').click();page.wait_for_function('fixture.history_settings.enabled===false')
        page.set_viewport_size({'width':800,'height':480});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
        assert not errors,errors
        assert all(path.startswith('/api/mesh/dashboard') for path,_ in page.evaluate('requestLog'))
        print('PASS: isolated Chromium fixture: 1280x800 + 800x480, pagination, filters, detail refresh/history, conversation event, raster/vector adapter, settings and clear; no live network or RF')
        browser.close()

if __name__=='__main__': main()
