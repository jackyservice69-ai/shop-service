import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("public/assets", { recursive: true });
const shapes = {
  bag: `<path d="M119 138q-3-73 61-73t61 73" fill="none" stroke="#695d50" stroke-width="12"/><path d="M88 129Q180 100 272 129L287 262Q180 291 73 262Z" fill="#ded0b9"/><path d="M90 135Q180 165 270 135L260 191Q180 216 100 191Z" fill="#eee4cf"/><rect x="169" y="176" width="23" height="29" rx="5" fill="#b89b6f"/><path d="M105 150L97 247M255 150L263 247" stroke="#c1ac8d" stroke-width="4"/>`,
  shoe: `<path d="M70 200Q80 158 100 124L137 150 165 143 204 178 282 198Q310 210 302 236L67 236Z" fill="#6e9684"/><path d="M71 225H302V248Q160 263 65 248Z" fill="#f1e4cb"/><path d="M143 162l56 45M155 151l57 44" stroke="#ece6cd" stroke-width="12"/><path d="M170 165l-21 11M180 175l-21 11M190 185l-21 11" stroke="#f6f1e5" stroke-width="6"/><path d="M243 197Q265 182 280 199L300 217 273 225Z" fill="#e6dfca"/>`,
  cup: `<path d="M127 99H239L225 268Q183 282 140 268Z" fill="#b6a3ce"/><rect x="122" y="89" width="123" height="23" rx="7" fill="#9c88b7"/><path d="M236 127Q300 117 286 189Q278 214 233 208" fill="none" stroke="#b6a3ce" stroke-width="16"/><path d="M191 97V47L210 33" stroke="#95849e" stroke-width="10" fill="none"/><path d="M149 124L158 250" stroke="#c9b8dd" stroke-width="7"/><text x="181" y="195" fill="#f1e9f6" text-anchor="middle" font-size="14" font-family="sans-serif">DAILY</text>`,
  headphone: `<path d="M94 201V147Q94 56 181 56T268 147V201" fill="none" stroke="#eae7db" stroke-width="27"/><path d="M94 140Q94 64 181 64T268 140" fill="none" stroke="#c5bfac" stroke-width="12"/><rect x="69" y="145" width="61" height="111" rx="28" fill="#d7d1be"/><rect x="235" y="145" width="61" height="111" rx="28" fill="#d7d1be"/><rect x="111" y="151" width="20" height="100" rx="10" fill="#bbb29b"/><rect x="232" y="151" width="20" height="100" rx="10" fill="#bbb29b"/>`,
  camera: `<rect x="61" y="112" width="246" height="143" rx="21" fill="#b7bcc5"/><path d="M73 123h221v112H73Z" fill="#cdd2d7"/><rect x="84" y="100" width="44" height="16" rx="5" fill="#808797"/><circle cx="203" cy="184" r="70" fill="#686e7c"/><circle cx="203" cy="184" r="55" fill="#b3b7bf"/><circle cx="203" cy="184" r="44" fill="#414b5c"/><circle cx="203" cy="184" r="30" fill="#61778d"/><circle cx="194" cy="173" r="13" fill="#9bb0bd" opacity=".6"/><rect x="80" y="137" width="36" height="17" rx="3" fill="#f0eee6"/>`,
  cap: `<path d="M99 205Q81 105 179 96Q271 103 268 207Z" fill="#9ba68a"/><path d="M99 199Q49 211 71 235Q142 271 274 219Q216 202 199 194Z" fill="#829273"/><path d="M179 102Q138 136 147 200" stroke="#b2bba6" fill="none" stroke-width="3"/><circle cx="179" cy="96" r="6" fill="#7e8b72"/><text x="212" y="173" font-family="sans-serif" font-size="19" fill="#e8e8d8" text-anchor="middle">little</text>`,
  tote: `<path d="M118 142V106Q118 61 153 61T188 106V142M181 142V106Q181 61 216 61T251 106V142" fill="none" stroke="#b97f8c" stroke-width="12"/><path d="M89 126H277L262 278H103Z" fill="#dba6ae"/><path d="M108 133H258L246 260H121Z" fill="#e8bec0"/><text x="183" y="200" font-family="serif" font-size="22" fill="#b27d8c" text-anchor="middle">soft days</text>`,
  perfume: `<rect x="134" y="55" width="99" height="62" rx="8" fill="#c8b5a0"/><rect x="116" y="112" width="135" height="169" rx="17" fill="#e0c7a3"/><rect x="130" y="125" width="107" height="140" rx="10" fill="#ecd8b7"/><rect x="130" y="159" width="107" height="73" rx="2" fill="#faf6eb"/><text x="183" y="190" font-family="serif" font-size="19" fill="#9c8267" text-anchor="middle">SUNDAY</text><text x="183" y="213" font-family="sans-serif" font-size="8" fill="#b29b81" text-anchor="middle">EAU DE PARFUM</text>`,
  placeholder: `<rect x="106" y="106" width="150" height="150" rx="20" fill="#d2c3e3"/><path d="M151 131v-34q0-33 30-33t30 33v34" fill="none" stroke="#a28abf" stroke-width="12"/>`,
};
const backgrounds = {
  bag: "#ede9e2",
  shoe: "#e9eee7",
  cup: "#ede7f4",
  headphone: "#efeee7",
  camera: "#e5e9ed",
  cap: "#e8ece3",
  tote: "#f4e7e7",
  perfume: "#f1eadd",
  placeholder: "#eeebf6",
};
for (const [name, shape] of Object.entries(shapes))
  writeFileSync(
    `public/assets/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 315"><rect width="360" height="315" fill="${backgrounds[name]}"/><ellipse cx="183" cy="280" rx="106" ry="12" fill="#514152" opacity=".05"/>${shape}</svg>`,
  );
