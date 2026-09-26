import { el } from "./ui.js";

// Decorative, locally authored illustrations; never populated with app metadata.
const drawings = [
  `<circle cx="160" cy="84" r="65" class="art-orbit"/>
   <g class="art-float"><rect x="54" y="33" width="47" height="47" rx="14" class="art-tile" transform="rotate(-12 77 56)"/><path d="M73 46v20l16-10z" class="art-solid"/></g>
   <g><rect x="193" y="30" width="42" height="42" rx="13" class="art-tile" transform="rotate(12 214 51)"/><path d="M206 51l6 6 11-13" class="art-stroke"/></g>
   <rect x="188" y="107" width="39" height="39" rx="12" class="art-tile" transform="rotate(-8 207 126)"/><path d="M199 125h16m-8-8v16" class="art-stroke"/>
   <rect x="77" y="106" width="34" height="34" rx="10" class="art-tile"/><path d="M87 127v-9l12-3v9m-12 3c0 4-6 4-6 0s6-4 6 0m12-3c0 4-6 4-6 0s6-4 6 0" class="art-stroke"/>
   <circle cx="150" cy="79" r="32" class="art-focus"/><circle cx="147" cy="76" r="13" class="art-stroke"/><path d="M157 86l13 13" class="art-stroke"/>
   <path d="M253 83v10m-5-5h10M41 99v6m-3-3h6" class="art-spark"/>`,
  `<circle cx="150" cy="87" r="65" class="art-orbit"/>
   <rect x="112" y="17" width="76" height="130" rx="18" class="art-phone"/><path d="M138 27h24m-18 109h12" class="art-stroke"/>
   <g class="art-solid"><path fill-rule="evenodd" d="M129 48h17v17h-17zm4 4v9h9v-9zm21-4h17v17h-17zm4 4v9h9v-9zm-29 21h17v17h-17zm4 4v9h9v-9z"/><path d="M153 71h6v6h-6zm12 0h6v12h-6zm-12 12h12v6h-12zm-24 11h12v6h-12zm19 0h6v6h-6zm17-5h6v11h-6z"/></g>
   <path d="M94 60v-12h12m88 0h12v12M94 104v12h12m88 0h12v-12" class="art-stroke"/>
   <path d="M102 80h96" class="art-scan"/>
   <g class="art-float"><circle cx="216" cy="112" r="17" class="art-focus"/><path d="M208 112l6 6 10-12" class="art-stroke"/></g>
   <path d="M66 66v12m-6-6h12M222 31v8m-4-4h8" class="art-spark"/>`,
  `<circle cx="151" cy="82" r="65" class="art-orbit"/>
   <rect x="40" y="62" width="104" height="69" rx="8" class="art-phone"/><path d="M33 134h118l-9 9H42z" class="art-tile"/>
   <rect x="52" y="74" width="31" height="31" rx="8" class="art-tile"/><path d="M64 81v16l12-8z" class="art-solid"/><path d="M93 80h35m-35 10h23m-41 26h51" class="art-stroke art-lines"/>
   <rect x="204" y="44" width="55" height="99" rx="13" class="art-phone"/><path d="M224 53h15m-14 81h13" class="art-stroke"/><rect x="215" y="73" width="33" height="33" rx="10" class="art-tile"/><path d="M223 89l6 6 12-13" class="art-stroke"/>
   <path d="M116 48c31-31 70-26 93 0" class="art-route"/><g class="art-float"><circle cx="164" cy="40" r="21" class="art-focus"/><path d="M153 40l23-10-7 23-5-10-11-3zm11 3l12-13" class="art-stroke"/></g>
   <path d="M172 106v12m-6-6h12M271 66v8m-4-4h8" class="art-spark"/>`,
];

export function stepArt(index) {
  const art = el("div", {
    class: `step-art step-art-${index + 1}`,
    "aria-hidden": "true",
  });
  art.innerHTML = `<svg viewBox="0 0 300 164" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">${drawings[index]}</svg>`;
  return art;
}

