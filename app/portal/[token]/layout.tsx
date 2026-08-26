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
.portal .changereq{margin-top:20px;padding-top:16px;border-top:1px dashed var(--line)}
/* A text button still needs a thumb-sized target: this was 24px tall. */
.portal .crtoggle{background:none;border:none;color:var(--brand);font-size:15px;font-weight:600;
  cursor:pointer;padding:10px 0;min-height:44px;text-decoration:underline;text-align:left}
.portal .crform{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.portal .crform label{font-size:13px;color:var(--soft)}
.portal .crlead{font-size:13px;color:var(--soft);margin:0 0 4px}
.portal .crform input,.portal .crform textarea{padding:10px;border:1px solid var(--line);border-radius:8px;font-size:16px;background:var(--card);color:inherit}
.portal .crform button{padding:11px;border:none;border-radius:8px;background:var(--brand);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.portal .crform button:disabled{opacity:.5}
.portal .crdone{font-size:14px;color:var(--brand);font-weight:600;margin:0}
.portal .leadcoord{margin:20px 0;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.portal .lchd{display:flex;align-items:center;justify-content:space-between;gap:12px}
.portal .lchd h2{margin:0;font-size:17px}
.portal .lccount{font-size:13px;color:var(--soft);font-weight:600;white-space:nowrap}
.portal .lclead{font-size:12px;color:var(--soft);margin:8px 0 14px;line-height:1.6}
.portal .lclist{display:flex;flex-direction:column;gap:12px}
.portal .lcrow{border:1px solid var(--line);border-radius:10px;padding:12px}
.portal .lctop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.portal .lcname{font-size:15px;font-weight:600}
.portal .lctag{font-style:normal;font-size:11px;background:var(--brand);color:#fff;border-radius:4px;padding:1px 6px;margin-left:6px}
.portal .lcstatus{font-size:12px;color:var(--soft);border:1px solid var(--line);border-radius:999px;padding:2px 10px}
.portal .lcstatus.ok{color:#2e7d32;border-color:#a5d6a7;background:#f1f8f2}
.portal .lcfields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.portal .lcfield{display:flex;flex-direction:column;gap:3px}
.portal .lcfield span{font-size:12px;color:var(--soft)}
.portal .lcfield input{padding:9px;border:1px solid var(--line);border-radius:8px;font-size:15px;background:var(--bg,#fff);color:inherit}
.portal .lcactions{display:flex;flex-wrap:wrap;gap:8px}
.portal .lcactions button{padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--brand);font-size:13px;font-weight:600;cursor:pointer}
.portal .lcactions button:disabled{opacity:.5}
.portal .lcactions .lcdanger{color:#c62828;border-color:#ef9a9a}
.portal .gateform button:disabled{opacity:.5;cursor:default}
.portal .gateerr{font-size:13px;color:#c0392b;margin:0}
.portal .op{font-size:12px;letter-spacing:.08em;color:var(--soft);margin:0 0 8px}
.portal .optag{font-size:11px;color:var(--soft);margin:-4px 0 8px}
/* globals.css colours every h1-h6 with --gray-900, a near-black. That is an
   element selector, so it beats the colour these headings would otherwise
   INHERIT from .portal. Invisible in light mode, where both are dark. In dark
   mode the portal's background flips and the headings do not, so a traveller
   with dark mode on — most of them, on a phone — saw a page whose every
   heading had vanished. Scoped to .portal: the operator's app is not touched. */
.portal h1,.portal h2,.portal h3,.portal h4,.portal h5,.portal h6{color:var(--ink)}
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
/* 16px, NOT 15. Below 16 iOS Safari zooms the whole page in when the field
   takes focus and does not zoom back out — on a form this long that is a lurch
   per field, and the traveller ends up dragging the page sideways to read the
   next label. The change-request form above already knew this. */
.f input,.f select,.f textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:6px;
  font:inherit;font-size:16px;background:#fff;color:var(--ink)}
.f input:focus,.f select:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:transparent}
.f.error input,.f.error select{border-color:var(--err)}
.f.warning input{border-color:var(--warn)}
.radios{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px;font-size:15px}
/* The whole label is the target, not the 13px dot inside it: on a phone the
   passport held/applying choice was a pinpoint. */
.radios label{display:flex;align-items:center;gap:8px;cursor:pointer;
  min-height:44px;padding:4px 10px 4px 6px;border-radius:8px}
.radios input[type=radio]{width:20px;height:20px;accent-color:var(--brand);flex:none}

.paxbody h5{font-size:13px;margin:16px 0 6px;color:var(--soft);font-weight:700}

/* Attached documents. A row reads as a fact already recorded, not a control:
   the file is on the booking, and the only action is to take it back off. */
.docs{margin:6px 0 4px}
.docs input[type=file]{display:block;width:100%;margin:8px 0 4px;font:inherit;font-size:15px;
  max-width:100%}
/* The native control's own button is the tap target — 28px tall and unstyled
   before this. It is the control that attaches a passport, so it should look
   and feel like a button worth pressing. */
.docs input[type=file]::file-selector-button{font:inherit;font-size:15px;font-weight:600;
  min-height:44px;padding:0 16px;margin-right:12px;border:1px solid var(--line);
  border-radius:8px;background:#fff;color:var(--ink);cursor:pointer}
.docs .doc-add{margin-top:6px}
.doc-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding:8px 10px;margin:4px 0;
  border:1px solid var(--line);border-radius:6px;background:#fafbf9}
.doc-row .doc-name{font-size:14px;font-weight:600;word-break:break-all}
.doc-row .doc-meta{font-size:12px;color:var(--soft)}
.doc-row button{margin-left:auto;font:inherit;font-size:14px;min-height:44px;padding:0 14px;
  cursor:pointer;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--err)}
.doc-row button:disabled{opacity:.5;cursor:default}
.docs-error{font-size:13px;color:var(--err);margin:6px 0}
.ins{margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:8px;background:#fafbf9}
.ins h4{margin-top:0}
.tell{margin:10px 0}
.tell .q{font-size:14px;margin:0 0 2px;font-weight:600}
.plans{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 12px}
@media(max-width:560px){.plans{grid-template-columns:1fr 1fr}}
.plan{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;cursor:pointer;
  border:1px solid var(--line);border-radius:7px;background:#fff;text-align:center}
.plan.on{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand) inset}
.plan.off{opacity:.5;cursor:not-allowed}
.plan b{font-size:15px}
.plan .amt{font-size:14px;font-weight:700}
.plan .band{font-size:11px;color:var(--soft)}
.plan .why{font-size:10px;color:var(--soft);line-height:1.3}
/* NOT .total — the payment block already owns .money .total, and a bare
   .total rule here restyled the ご旅行代金 row. */
.instotal{font-size:14px;margin:4px 0 0}
.instotal b{font-size:16px}
.instotal em{font-style:normal;font-size:12px;color:var(--soft);margin-left:8px}
.issues{margin:14px 0 0;padding:12px 14px 12px 30px;border-radius:6px;background:#fdf6f5;
  border:1px solid #f0d8d5;font-size:13px}
.issues li{margin:3px 0}
.issues li.error{color:var(--err)}
.issues li.warning{color:var(--warn)}
.actions{display:flex;gap:10px;margin-top:16px}
.actions button{flex:1;min-height:48px;padding:12px;border-radius:7px;font:inherit;font-weight:700;
  cursor:pointer;font-size:15px}
/* Two buttons side by side stop being pressable somewhere around here: stack
   them rather than shrink them. */
@media(max-width:420px){
  .actions{flex-direction:column-reverse}
}
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

.portal .opname{font-weight:700}
.offices{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:10px 14px;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr));text-align:left;
  /* A shade smaller than the rest of the footer so each office holds three
     lines at this column width instead of wrapping into four. */
  font-size:11px;line-height:1.45}
.offices li{display:flex;flex-direction:column;gap:1px}
.offices b{font-weight:600;font-size:11.5px}
.offices em{font-style:normal}
.offices .l1{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.offices .tel{display:flex;gap:10px;flex-wrap:wrap}
@media(max-width:560px){
  .offices{text-align:center;grid-template-columns:1fr;font-size:12px}
  .offices li{align-items:center}
  .offices .l1,.offices .tel{justify-content:center}
}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);
  font-size:12px;color:var(--soft)}
.portal footer p{margin:2px 0}

@media(prefers-color-scheme:dark){
  .portal{--ink:#e8eae7;--soft:#9aa29a;--line:#2c322c;--bg:#141714;--card:#1b1f1b;
    --err:#f2b8b5;--warn:#d6ac58;--ok:#8fb795}
  .money .total,.money .due{background:#191d19}
  .f input,.f select,.f textarea{background:#141714;color:var(--ink)}
  .docs input[type=file]::file-selector-button{background:#1b1f1b;color:var(--ink)}
  .ins{background:#131613}
  .plan{background:#141714}
  .issues{background:#241a19;border-color:#3a2422}
  .actions .ghost{background:#1b1f1b}
  .locked{background:#1b1f1b}
  .doc-row{background:#131613}
  .doc-row button{background:#1b1f1b}
}
`
