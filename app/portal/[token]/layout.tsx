// The portal sits OUTSIDE the operator's app shell — no sidebar, no locale
// switcher, no auth chrome. A customer should not see the tooling.
//
// Styles are inline rather than Tailwind classes because this page is rendered
// for a customer on a phone and must not depend on the operator theme changing
// underneath it.

import type { ReactNode } from 'react'

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{CSS}</style>
      {children}
    </>
  )
}

const CSS = `
.portal {
  --ink:#1a1d1a; --soft:#5b625b; --line:#dce0da; --bg:#f6f7f4; --card:#fff;
  --err:#b3261e; --warn:#8a6414; --ok:#3f6b45;
  max-width:720px; margin:0 auto; padding:0 16px 72px;
  font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;
  color:var(--ink); background:var(--bg); font-size:15px; line-height:1.7;
}
.portal *{box-sizing:border-box}
.portal .hd{padding:32px 0 20px;border-bottom:2px solid var(--brand)}
.portal .oplogo{max-height:44px;max-width:180px;object-fit:contain;display:block;margin:0 0 10px}
.portal .gate{max-width:420px}
.portal .gateform{display:flex;flex-direction:column;gap:10px}
.portal .gateform label{font-size:13px;color:var(--soft)}
.portal .gateform input{padding:12px;border:1px solid var(--line);border-radius:8px;font-size:16px;background:var(--card);color:inherit}
.portal .gateform button{padding:12px;border:none;border-radius:8px;background:var(--brand);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.portal .gateform button:disabled{opacity:.5;cursor:default}
.portal .gateerr{font-size:13px;color:#c0392b;margin:0}
.portal .op{font-size:12px;letter-spacing:.08em;color:var(--soft);margin:0 0 8px}
.portal .optag{font-size:11px;color:var(--soft);margin:-4px 0 8px}
.portal h1{font-size:22px;line-height:1.4;margin:0 0 8px;font-weight:700}
.portal .sub{margin:0;color:var(--soft);font-size:14px}
.portal .ref{margin:6px 0 0;color:var(--soft);font-size:12px;font-variant-numeric:tabular-nums}
.portal section{margin-top:36px}
.portal h2{font-size:16px;margin:0 0 14px;padding-left:10px;border-left:3px solid var(--brand)}
.portal h4{font-size:14px;margin:22px 0 6px}
.portal .hint,.portal .note{font-size:13px;color:var(--soft);margin:0 0 12px}
.portal .note strong{color:var(--err)}

.money{background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.money .row{display:flex;justify-content:space-between;align-items:baseline;gap:16px;
  padding:13px 16px;border-bottom:1px solid var(--line)}
.money .row:last-child{border-bottom:none}
.money .row span{font-size:14px}
.money .row em{display:block;font-style:normal;font-size:12px;color:var(--soft);margin-top:2px}
.money .row b{font-variant-numeric:tabular-nums;white-space:nowrap}
.money .total{background:#fafbf9}
.money .due{background:#fafbf9;font-weight:700}
.money .paid{color:var(--ok)}
.money .tag{font-size:11px;margin-left:8px;color:var(--ok);font-weight:400}
.pay{display:block;text-align:center;margin-top:14px;padding:13px;border-radius:8px;
  background:var(--brand);color:#fff;text-decoration:none;font-weight:700}

.pax{background:var(--card);border:1px solid var(--line);border-radius:8px;margin-bottom:12px;overflow:hidden}
.pax.done{border-color:#cfe0d2}
.paxhd{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:14px 16px;background:none;border:0;cursor:pointer;font:inherit;text-align:left;color:inherit}
.paxhd .who b{font-size:15px}
.paxhd .lead{font-style:normal;font-size:11px;margin-left:8px;padding:2px 7px;border-radius:3px;
  background:#eef2ea;color:var(--soft)}
.paxhd .state{font-size:12px;color:var(--warn);white-space:nowrap}
.paxhd .state.ok{color:var(--ok)}
.paxbody{padding:0 16px 18px;border-top:1px solid var(--line)}
.paxbody fieldset{border:0;padding:0;margin:0}
.paxbody fieldset:disabled{opacity:.55}

.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:560px){.g2{grid-template-columns:1fr}}
.f{display:block;margin-bottom:2px}
.f.wide{grid-column:1/-1}
.f>span{display:block;font-size:12px;color:var(--soft);margin-bottom:4px}
.f input,.f select{width:100%;padding:10px;border:1px solid var(--line);border-radius:6px;
  font:inherit;font-size:15px;background:#fff;color:var(--ink)}
.f input:focus,.f select:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:transparent}
.f.error input,.f.error select{border-color:var(--err)}
.f.warning input{border-color:var(--warn)}
.radios{display:flex;flex-wrap:wrap;gap:16px;margin:6px 0 12px;font-size:14px}
.radios label{display:flex;align-items:center;gap:6px;cursor:pointer}

.issues{margin:14px 0 0;padding:12px 14px 12px 30px;border-radius:6px;background:#fdf6f5;
  border:1px solid #f0d8d5;font-size:13px}
.issues li{margin:3px 0}
.issues li.error{color:var(--err)}
.issues li.warning{color:var(--warn)}
.actions{display:flex;gap:10px;margin-top:16px}
.actions button{flex:1;padding:12px;border-radius:7px;font:inherit;font-weight:700;cursor:pointer;font-size:14px}
.actions .primary{background:var(--brand);color:#fff;border:0}
.actions .primary:disabled{opacity:.45;cursor:not-allowed}
.actions .ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
.blocked{font-size:12px;color:var(--err);margin:8px 0 0;text-align:center}
.locked{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px;font-size:14px}

.docs{list-style:none;padding:0;margin:0}
.docs li{margin-bottom:8px}
.docs a{display:flex;justify-content:space-between;align-items:center;gap:12px;
  background:var(--card);border:1px solid var(--line);border-radius:8px;
  padding:14px 16px;text-decoration:none;color:inherit}
.docs a:hover{border-color:var(--brand)}
.docs a:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.docs .dt{font-size:15px;font-weight:700}
.docs .dn{font-size:12px;color:var(--soft);white-space:nowrap}

.days{list-style:none;padding:0;margin:0}
.days li{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--line)}
.days li:last-child{border-bottom:none}
.days .dn{flex:0 0 58px;font-size:12px;color:var(--soft);padding-top:2px}
.days h3{font-size:15px;margin:0 0 4px}
.days p{margin:0;font-size:14px;white-space:pre-line}
.days .ov{color:var(--soft);font-size:13px;margin-top:4px}

.portal footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);
  font-size:12px;color:var(--soft)}
.portal footer p{margin:2px 0}

@media(prefers-color-scheme:dark){
  .portal{--ink:#e8eae7;--soft:#9aa29a;--line:#2c322c;--bg:#141714;--card:#1b1f1b;
    --err:#f2b8b5;--warn:#d6ac58;--ok:#8fb795}
  .money .total,.money .due{background:#191d19}
  .f input,.f select{background:#141714;color:var(--ink)}
  .issues{background:#241a19;border-color:#3a2422}
  .actions .ghost{background:#1b1f1b}
  .locked{background:#1b1f1b}
}
`
