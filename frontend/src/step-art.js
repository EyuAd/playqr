import { el } from "./ui.js";

// Decorative vector scenes, separate from the original icons in app results.
const drawings = [
  `<circle cx="162" cy="104" r="77" class="scene-orbit"/>
   <circle cx="162" cy="104" r="57" class="scene-orbit inner"/>
   <path d="M63 151h200" class="scene-ground"/>
   <g class="scene-lift">
     <rect x="110" y="25" width="88" height="151" rx="19" class="scene-shadow"/>
     <rect x="104" y="19" width="88" height="151" rx="19" class="scene-paper"/>
     <rect x="113" y="37" width="70" height="111" rx="6" class="scene-screen"/>
     <path d="M136 28h24m-16 131h9" class="scene-line"/>
     <g class="scene-ink"><path fill-rule="evenodd" d="M125 54h18v18h-18zm5 5v8h8v-8zm23-5h18v18h-18zm5 5v8h8v-8zm-33 28h18v18h-18zm5 5v8h8v-8z"/><path d="M152 81h7v7h-7zm12 0h7v16h-7zm-12 15h7v7h-7zm-27 15h13v6h-13zm22-1h7v7h-7zm16-4h8v11h-8z"/></g>
   </g>
   <path d="M93 68V47h21m67 0h22v21M93 115v22h21m67 0h22v-22" class="scene-line scene-brackets"/>
   <path d="M87 91h122" class="scene-scan"/>
   <g class="scene-accent-badge"><circle cx="221" cy="139" r="25" class="scene-accent"/><path d="m210 139 8 8 14-17" class="scene-line"/></g>
   <path d="M66 58v12m-6-6h12M248 83v8m-4-4h8" class="scene-spark"/>
   <circle cx="73" cy="128" r="3" class="scene-ink"/>`,
  `<circle cx="162" cy="103" r="77" class="scene-orbit"/>
   <circle cx="162" cy="103" r="57" class="scene-orbit inner"/>
   <path d="M59 159h220" class="scene-ground"/>
   <g transform="rotate(-13 143 102)"><rect x="78" y="32" width="124" height="131" rx="10" class="scene-shadow"/><path d="M94 54h72M94 66h46" class="scene-line scene-faint"/></g>
   <g transform="rotate(9 169 106)"><rect x="104" y="34" width="124" height="136" rx="10" class="scene-screen"/></g>
   <g class="scene-lift">
     <rect x="91" y="39" width="128" height="129" rx="10" class="scene-paper"/>
     <path d="M108 57h62m-62 10h37" class="scene-line"/>
     <path d="M184 39v32l10-6 10 6V39" class="scene-accent"/>
     <rect x="108" y="83" width="39" height="33" rx="8" class="scene-blue"/><path d="M123 91v17l12-8.5z" class="scene-white"/>
     <rect x="162" y="83" width="39" height="33" rx="8" class="scene-screen"/><path d="m174 105 4-12 9 4-4 12m-9-4c0 4-5 4-5 0s5-4 5 0m9 4c0 4-5 4-5 0s5-4 5 0" class="scene-line"/>
     <rect x="108" y="125" width="39" height="27" rx="7" class="scene-screen"/><path d="M119 133h17m-17 9h11" class="scene-line"/>
     <rect x="162" y="125" width="39" height="27" rx="7" class="scene-accent"/><path d="M181 132v13m-6.5-6.5h13" class="scene-line"/>
   </g>
   <circle cx="64" cy="109" r="5" class="scene-orbit"/>
   <path d="M247 104v14m-7-7h14M240 48v8m-4-4h8" class="scene-spark"/>`,
  `<circle cx="163" cy="104" r="77" class="scene-orbit"/>
   <circle cx="163" cy="104" r="57" class="scene-orbit inner"/>
   <path d="M38 169h239" class="scene-ground"/>
   <rect x="39" y="77" width="119" height="78" rx="8" class="scene-shadow"/>
   <rect x="34" y="72" width="119" height="78" rx="8" class="scene-paper"/>
   <path d="M27 151h133l-10 10H38z" class="scene-screen"/>
   <rect x="47" y="87" width="36" height="36" rx="9" class="scene-blue"/><path d="M60 94v21l15-10.5z" class="scene-white"/>
   <path d="M95 93h40m-40 11h26m-26 11h34m-75 22h75" class="scene-line scene-faint"/>
   <g class="scene-lift"><rect x="215" y="65" width="60" height="107" rx="14" class="scene-shadow"/>
     <rect x="210" y="59" width="60" height="107" rx="14" class="scene-paper"/><path d="M232 69h15m-13 87h13" class="scene-line"/>
     <rect x="220" y="89" width="40" height="40" rx="11" class="scene-accent"/><path d="m230 110 7 7 14-16" class="scene-line"/>
   </g>
   <path d="M89 61c26-39 81-41 120-10" class="scene-route"/>
   <g class="scene-plane"><circle cx="159" cy="43" r="25" class="scene-blue"/><path d="m144 43 29-12-9 29-7-12-13-5zm13 5 16-17" class="scene-plane-line"/></g>
   <path d="M180 128v13m-6.5-6.5h13M281 37v9m-4.5-4.5h9" class="scene-spark"/>
   <circle cx="64" cy="43" r="3" class="scene-ink"/>`,
];

export function stepArt(index) {
  const art = el("div", {
    class: `step-art step-art-${index + 1}`,
    "data-step": String(index + 1).padStart(2, "0"),
    "aria-hidden": "true",
  });
  art.innerHTML = `<svg viewBox="0 0 320 192" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">${drawings[index]}</svg>`;
  return art;
}
