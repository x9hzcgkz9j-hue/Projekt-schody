/**
 * Projektant Schodów — PWA (React)
 * Single-file app (App.jsx) prepared for Vite/CRA deployment.
 * Features:
 * - Metric units (mm)
 * - Theme switch (light/dark)
 * - Profiles catalog (angles, RHS, IPE, UPN, pipes)
 * - Balustrade styles (no glass)
 * - Norms checks (Blondel + heuristics)
 * - 3D preview (Three.js)
 * - PDF export (html2canvas + jsPDF) with small signature
 *
 * To run: create a new Vite React project or CRA, install dependencies listed below,
 * and replace src/App.jsx with this file. See README section at bottom.
 */

import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import './styles.css'

// ---------- Profiles Catalog ----------
const PROFILES = {
  angles: [
    { name: 'L 40x40x4', dims: '40x40x4', mass: 1.2 },
    { name: 'L 50x50x5', dims: '50x50x5', mass: 1.8 },
    { name: 'L 63x63x6', dims: '63x63x6', mass: 2.7 },
    { name: 'L 80x80x8', dims: '80x80x8', mass: 4.5 }
  ],
  rhs: [
    { name: 'RHS 40x20x2', dims: '40x20x2', mass: 1.1 },
    { name: 'RHS 60x40x3', dims: '60x40x3', mass: 2.2 },
    { name: 'RHS 80x40x4', dims: '80x40x4', mass: 3.5 }
  ],
  ibeams: [
    { name: 'IPE 80', dims: 'IPE80', mass: 6.6 },
    { name: 'IPE 100', dims: 'IPE100', mass: 9.1 },
    { name: 'IPE 120', dims: 'IPE120', mass: 11.6 }
  ],
  channels: [
    { name: 'UPN 80', dims: 'UPN80', mass: 5.0 },
    { name: 'UPN 100', dims: 'UPN100', mass: 6.7 }
  ],
  pipes: [
    { name: 'Ø33.7x2', dims: '33.7x2', mass: 2.0 },
    { name: 'Ø42.4x2', dims: '42.4x2', mass: 2.6 }
  ]
}

// ---------- Utils ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

function calculateStairs(totalRise, desiredRiser, desiredTread, stairType, landingDepth) {
  const rise = Math.max(10, totalRise)
  let targetRiser = desiredRiser || 170
  targetRiser = clamp(targetRiser, 120, 210)
  let steps = Math.round(rise / targetRiser)
  if (steps < 1) steps = 1
  let riser = rise / steps
  while (riser > 210 && steps < 200) { steps += 1; riser = rise / steps }
  while (riser < 120 && steps > 1) { steps -= 1; riser = rise / steps }
  const tFromRule = 600 - 2 * riser
  let tread = desiredTread || tFromRule
  tread = clamp(tread, 160, 400)
  if (stairType === 'spiral') tread = Math.min(tread, 240)
  let totalRun = tread * steps
  if (stairType === 'l' || stairType === 'u') { totalRun += (landingDepth && landingDepth > 0) ? landingDepth : 900 }
  const stringerLength = Math.sqrt(totalRun*totalRun + rise*rise)
  const angleDeg = Math.atan2(rise, totalRun) * 180 / Math.PI
  return {
    steps, riser: +riser.toFixed(1), tread: +tread.toFixed(1), totalRun: +totalRun.toFixed(1), stringerLength: +stringerLength.toFixed(1), angleDeg: +angleDeg.toFixed(1)
  }
}

function checkNorms(result) {
  const warnings = []
  const r = result.riser
  const t = result.tread
  const sum = 2*r + t
  if (r < 120) warnings.push('Wysokość podstopnia poniżej 120 mm — nietypowo niska.')
  if (r < 150) warnings.push('Wysokość podstopnia < 150 mm — poniżej zalecanego zakresu ergonomicznego.')
  if (r > 200) warnings.push('Wysokość podstopnia > 200 mm — przekracza typowe limity i może być niebezpieczna.')
  if (t < 240) warnings.push('Głębokość biegu < 240 mm — może być zbyt mała dla komfortu chodu.')
  if (sum < 550 || sum > 700) warnings.push(`Zasada Blondela (2R + T) poza zakresem 550–700 mm (obecnie ${Math.round(sum)} mm). Optimum ≈ 600 mm.`)
  if (result.angleDeg > 45) warnings.push(`Kąt schodów (${result.angleDeg}°) większy niż 45° — strome.`)
  return warnings
}

// ---------- Three.js 3D preview ----------
function useThree(canvasRef, result, material, balustradeStyle, balustradeSpacing, handrailHeight, profile) {
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !result) return
    // clear previous
    while (el.firstChild) el.removeChild(el.firstChild)

    const width = el.clientWidth
    const height = el.clientHeight
    const scene = new THREE.Scene()
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    const totalRun = result.totalRun / 1000
    const totalRise = (result.riser * result.steps) / 1000
    camera.position.set(totalRun, totalRise, Math.max(totalRun, totalRise) * 1.5)
    camera.lookAt(new THREE.Vector3(totalRun/2, totalRise/2, 0))

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(totalRun/2, totalRise/2, 0)
    controls.update()

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dir = new THREE.DirectionalLight(0xffffff, 0.6)
    dir.position.set(5,10,5); scene.add(dir)

    const tread = result.tread / 1000
    const riser = result.riser / 1000
    const depth = 0.25
    const mat = new THREE.MeshStandardMaterial({ color: material === 'wood' ? 0x8b5a2b : 0xbfc9cc, metalness: material === 'steel' ? 1.0 : 0.1, roughness: material === 'steel' ? 0.25 : 0.6 })

    for (let i=0;i<result.steps;i++){
      const x = i * tread
      const y = i * riser
      const geo = new THREE.BoxGeometry(tread, 0.02, depth)
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x + tread/2, y + 0.01, 0)
      scene.add(m)
      // riser
      const rgeo = new THREE.BoxGeometry(0.01, riser, depth)
      const rm = new THREE.Mesh(rgeo, mat)
      rm.position.set(x, y + riser/2, 0)
      scene.add(rm)
    }

    // stringer / profiles
    if (material === 'steel'){
      const totalRunM = result.totalRun / 1000
      const totalRiseM = (result.steps * result.riser) / 1000
      const angle = Math.atan2(totalRiseM, totalRunM)
      // approximate as box rotated
      const length = Math.sqrt(totalRunM*totalRunM + totalRiseM*totalRiseM)
      const sgeo = new THREE.BoxGeometry(length, 0.04, 0.05)
      const smat = new THREE.MeshStandardMaterial({ color: 0xaeb6bf, metalness:1, roughness:0.2})
      const s = new THREE.Mesh(sgeo, smat)
      s.position.set(totalRunM/2, totalRiseM/2 - 0.02, -0.12)
      s.rotation.z = -angle
      scene.add(s)
    }

    // balustrade posts
    if (balustradeStyle !== 'none'){
      const totalRunM = result.totalRun / 1000
      const spacing = Math.max(0.05, balustradeSpacing/1000)
      for (let px=0; px<=totalRunM; px+=spacing){
        if (balustradeStyle === 'vertical'){
          const postGeo = new THREE.CylinderGeometry(0.01,0.01,handrailHeight/1000,8)
          const p = new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({color:0xaeb6bf,metalness:1}));
          p.position.set(px, handrailHeight/1000/2, 0.26); scene.add(p)
        } else if (balustradeStyle === 'perforated'){
          const panelW = Math.min(1.0, spacing)
          const panel = new THREE.BoxGeometry(panelW, (handrailHeight-50)/1000, 0.02)
          const pm = new THREE.Mesh(panel, new THREE.MeshStandardMaterial({color:0x999999,metalness:1,opacity:1,transparent:false})); pm.position.set(px+panelW/2, (handrailHeight-50)/1000/2, 0.26); scene.add(pm)
        }
      }
      // handrail
      const railGeo = new THREE.CylinderGeometry(0.02,0.02,result.totalRun/1000,8)
      const rail = new THREE.Mesh(railGeo, new THREE.MeshStandardMaterial({color:0xaeb6bf,metalness:1}));
      rail.rotation.z = -Math.atan2((result.steps*result.riser)/1000, result.totalRun/1000)
      rail.position.set(result.totalRun/1000/2, handrailHeight/1000, 0.26)
      scene.add(rail)
    }

    renderer.setAnimationLoop(()=>{ renderer.render(scene, camera) })

    function handleResize(){ const w = el.clientWidth; const h = el.clientHeight; renderer.setSize(w,h); camera.aspect = w/h; camera.updateProjectionMatrix() }
    window.addEventListener('resize', handleResize)

    return () => { window.removeEventListener('resize', handleResize); renderer.dispose(); while(el.firstChild) el.removeChild(el.firstChild) }
  }, [canvasRef, result, material, balustradeStyle, balustradeSpacing, handrailHeight, profile])
}

// ---------- React App Component ----------
export default function App(){
  const [totalRise, setTotalRise] = useState(2700)
  const [desiredRiser, setDesiredRiser] = useState(170)
  const [desiredTread, setDesiredTread] = useState(280)
  const [stairType, setStairType] = useState('straight')
  const [landingDepth, setLandingDepth] = useState(900)
  const [material, setMaterial] = useState('wood')
  const [balustradeStyle, setBalustradeStyle] = useState('vertical') // vertical | perforated | none
  const [balustradeSpacing, setBalustradeSpacing] = useState(120)
  const [handrailHeight, setHandrailHeight] = useState(950)
  const [profileCategory, setProfileCategory] = useState('angles')
  const [profileIndex, setProfileIndex] = useState(0)
  const [result, setResult] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [theme, setTheme] = useState('auto') // auto, light, dark

  const canvasRef = useRef(null)
  useThree(canvasRef, result, material, balustradeStyle, balustradeSpacing, handrailHeight, {category:profileCategory, index:profileIndex})

  useEffect(()=>{
    const saved = localStorage.getItem('ps_theme')
    if(saved) setTheme(saved)
  },[])
  useEffect(()=>{ localStorage.setItem('ps_theme', theme); document.documentElement.setAttribute('data-theme', theme) },[theme])

  function compute(){
    const res = calculateStairs(Number(totalRise), Number(desiredRiser), Number(desiredTread), stairType, Number(landingDepth))
    setResult(res)
    setWarnings(checkNorms(res))
  }

  async function exportPDF(){
    if(!result) return alert('Oblicz najpierw wymiary')
    // capture the drawing area (include side and top + table)
    const node = document.getElementById('export-area')
    const canvas = await html2canvas(node, { scale: 2 })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const imgProps = pdf.getImageProperties(imgData)
    const pdfW = pdf.internal.pageSize.getWidth()
    const pdfH = (imgProps.height * pdfW) / imgProps.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)
    pdf.setFontSize(9)
    pdf.text('Wygenerowano w Projektant Schodów (web) — data: ' + new Date().toLocaleString(), 40, pdf.internal.pageSize.getHeight() - 30)
    const blob = pdf.output('bloburl')
    const a = document.createElement('a'); a.href = blob; a.download = 'schody_rysunek.pdf'; a.click()
  }

  return (
    <div className={`app ${theme==='dark'?'dark':''}`}>
      <header className="top">
        <h1>Projektant Schodów (Web PWA)</h1>
        <div className="controls">
          <label>Motyw: </label>
          <select value={theme} onChange={e=>setTheme(e.target.value)}>
            <option value="auto">Auto</option>
            <option value="light">Jasny</option>
            <option value="dark">Ciemny</option>
          </select>
        </div>
      </header>

      <main>
        <section className="left">
          <h2>Parametry</h2>
          <div className="row"><label>Wysokość całkowita (mm)</label><input type="number" value={totalRise} onChange={e=>setTotalRise(e.target.value)} /></div>
          <div className="row"><label>Żądane podstopnie (mm)</label><input type="number" value={desiredRiser} onChange={e=>setDesiredRiser(e.target.value)} /></div>
          <div className="row"><label>Żądana głębokość biegu (mm)</label><input type="number" value={desiredTread} onChange={e=>setDesiredTread(e.target.value)} /></div>
          <div className="row"><label>Typ</label>
            <select value={stairType} onChange={e=>setStairType(e.target.value)}>
              <option value="straight">Proste</option>
              <option value="l">Zabiegowe (L)</option>
              <option value="u">Zabiegowe (U)</option>
              <option value="spiral">Kręcone</option>
            </select>
          </div>
          { (stairType==='l' || stairType==='u') && <div className="row"><label>Głębokość spocznika (mm)</label><input type="number" value={landingDepth} onChange={e=>setLandingDepth(e.target.value)} /></div> }

          <h3>Materiał / Balustrada</h3>
          <div className="row"><label>Materiał</label>
            <select value={material} onChange={e=>setMaterial(e.target.value)}>
              <option value="wood">Drewniane</option>
              <option value="steel">Stalowe</option>
            </select>
          </div>
          <div className="row"><label>Balustrada</label>
            <select value={balustradeStyle} onChange={e=>setBalustradeStyle(e.target.value)}>
              <option value="none">Brak</option>
              <option value="vertical">Pionowe pręty</option>
              <option value="perforated">Blacha perforowana</option>
            </select>
          </div>
          { balustradeStyle !== 'none' && <>
            <div className="row"><label>Rozstaw prętów (mm)</label><input type="number" value={balustradeSpacing} onChange={e=>setBalustradeSpacing(e.target.value)} /></div>
            <div className="row"><label>Wysokość poręczy (mm)</label><input type="number" value={handrailHeight} onChange={e=>setHandrailHeight(e.target.value)} /></div>
          </> }

          <h3>Profile stalowe</h3>
          <div className="row"><label>Kategoria</label>
            <select value={profileCategory} onChange={e=>{ setProfileCategory(e.target.value); setProfileIndex(0) }}>
              <option value="angles">Kątowniki (L)</option>
              <option value="rhs">RHS</option>
              <option value="ibeams">I-beam (IPE)</option>
              <option value="channels">Ceowniki (UPN)</option>
              <option value="pipes">Rury</option>
            </select>
          </div>
          <div className="row"><label>Rozmiar</label>
            <select value={profileIndex} onChange={e=>setProfileIndex(Number(e.target.value))}>
              { PROFILES[profileCategory].map((p, i)=> <option key={i} value={i}>{p.name}</option>) }
            </select>
          </div>

          <div className="actions">
            <button onClick={compute}>Oblicz wymiary</button>
            <button onClick={exportPDF} className="muted">Eksportuj PDF</button>
          </div>

          { warnings.length>0 && <div className="warnings"><h4>Ostrzeżenia</h4><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div> }

        </section>

        <section className="right">
          <div id="export-area" className="export-area">
            <div className="preview-3d" ref={canvasRef} style={{height: 320, background:'#fff'}}></div>
            <div className="info">
              { result ? (
                <>
                  <h3>Wynik</h3>
                  <table>
                    <tbody>
                      <tr><td>Liczba podstopni</td><td>{result.steps}</td></tr>
                      <tr><td>Wysokość podstopnia (mm)</td><td>{result.riser}</td></tr>
                      <tr><td>Głębokość biegu (mm)</td><td>{result.tread}</td></tr>
                      <tr><td>Całkowity przebieg (mm)</td><td>{result.totalRun}</td></tr>
                      <tr><td>Długość policzka (mm)</td><td>{result.stringerLength}</td></tr>
                      <tr><td>Kąt (deg)</td><td>{result.angleDeg}</td></tr>
                      <tr><td>Profil stalowy</td><td>{PROFILES[profileCategory][profileIndex].name}</td></tr>
                    </tbody>
                  </table>
                </>
              ) : (<p>Brak obliczeń — kliknij "Oblicz wymiary"</p>) }
            </div>
          </div>

          <div className="tips">
            <p>Tip: możesz dodać tę stronę do ekranu głównego w Safari (Udostępnij → Dodaj do ekranu początkowego).</p>
          </div>
        </section>
      </main>

      <footer className="foot">© Projektant Schodów (web) — Wygenerowano: {new Date().toLocaleDateString()}</footer>
    </div>
  )
}

/*
  ---------------------------
  styles.css (minimal)
  ---------------------------
  body,html,#root{height:100%;margin:0;font-family:system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial}
  .app{max-width:1100px;margin:0 auto;padding:12px}
  .top{display:flex;justify-content:space-between;align-items:center}
  main{display:flex;gap:12px;margin-top:12px}
  .left{flex:1;min-width:320px}
  .right{flex:1.2}
  .row{display:flex;justify-content:space-between;align-items:center;margin:8px 0}
  input,select{padding:6px;border:1px solid #ddd;border-radius:6px;width:140px}
  button{padding:8px 12px;margin:6px;border-radius:8px;border:none;background:#0b79ff;color:white}
  .muted{background:#666}
  table{width:100%;border-collapse:collapse}
  td{padding:6px;border-bottom:1px solid #eee}
  .warnings{background:#fff4e5;padding:8px;border-radius:6px;margin-top:8px}
  .export-area{background:white;padding:8px;border-radius:8px}
  .foot{margin-top:12px;font-size:12px;color:#666}
  [data-theme='dark']{background:#0b1020;color:#ddd}
  [data-theme='dark'] input,[data-theme='dark'] select{background:#111;color:#ddd;border:1px solid #333}
*/

/*
  ---------------------------
  README / Deployment
  ---------------------------
  Dependencies (install in your project):
    npm i react three html2canvas jspdf

  Quick start with Vite:
    npm create vite@latest projektant-schody -- --template react
    cd projektant-schody
    npm install
    npm i three html2canvas jspdf
    replace src/App.jsx with this file content
    add styles.css to src and import it (already imported above)
    npm run dev

  To deploy (and make accessible from iPhone):
  - Option A: Deploy to Vercel or Netlify (connect GitHub repo, push code) — they provide HTTPS link. Open link on iPhone Safari and add to home screen.
  - Option B: Use GitHub Pages (simpler) or static site host.

  Notes for iPhone users:
  - Open the hosted URL in Safari. Tap Share → Add to Home Screen to install PWA-like icon.
  - PDF export downloads file to iPhone Downloads folder; from Safari use share sheet to save or send it.

  If you want, mogę:
  - provide a ready-to-deploy ZIP with project files,
  - deploy it to a free hosting (Netlify/Vercel) and give you the link (I can prepare the repo content here — you still need to create the site or I can provide exact steps).
*/
