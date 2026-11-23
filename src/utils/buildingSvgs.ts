import type { BuildingId } from '../data/munitions';

export const BUILDING_SVG_MARKUP: Record<BuildingId, string> = {
  residential: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <defs>
    <linearGradient id="res-a" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6F7780" />
      <stop offset="55%" stop-color="#586068" />
      <stop offset="100%" stop-color="#3F464E" />
    </linearGradient>
    <linearGradient id="res-b" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#5C646E" />
      <stop offset="55%" stop-color="#485059" />
      <stop offset="100%" stop-color="#323840" />
    </linearGradient>
  </defs>
  <ellipse cx="40" cy="49" rx="30" ry="3.2" fill="#090D14" opacity="0.55" />
  <rect x="13" y="46.5" width="54" height="3" rx="0.8" fill="#2A3038" stroke="#181D23" stroke-width="0.6" />
  <rect x="14" y="17" width="21" height="29.5" rx="0.8" fill="url(#res-a)" stroke="#1B2027" stroke-width="0.75" />
  <rect x="14" y="15.5" width="21" height="2.2" fill="#323840" stroke="#1B2027" stroke-width="0.6" />
  <rect x="35" y="10" width="30" height="36.5" rx="0.8" fill="url(#res-b)" stroke="#1B2027" stroke-width="0.75" />
  <rect x="35" y="8.5" width="30" height="2.2" fill="#292F36" stroke="#1B2027" stroke-width="0.6" />
  <rect x="43" y="5" width="13" height="3.8" fill="#464E57" stroke="#1B2027" stroke-width="0.6" />
  <rect x="46" y="3" width="2.2" height="2.2" fill="#68707A" />
  <rect x="17.5" y="20" width="4" height="3.2" fill="#C9A86A" opacity="0.75" />
  <rect x="23" y="20" width="4" height="3.2" fill="#27313D" />
  <rect x="28.5" y="20" width="4" height="3.2" fill="#C9A86A" opacity="0.65" />
  <rect x="17.5" y="26" width="4" height="3.2" fill="#27313D" />
  <rect x="23" y="26" width="4" height="3.2" fill="#C9A86A" opacity="0.8" />
  <rect x="28.5" y="26" width="4" height="3.2" fill="#27313D" />
  <rect x="17.5" y="32" width="4" height="3.2" fill="#C9A86A" opacity="0.7" />
  <rect x="23" y="32" width="4" height="3.2" fill="#27313D" />
  <rect x="28.5" y="32" width="4" height="3.2" fill="#C9A86A" opacity="0.75" />
  <rect x="17.5" y="38" width="4" height="3.2" fill="#27313D" />
  <rect x="23" y="38" width="4" height="3.2" fill="#27313D" />
  <rect x="28.5" y="38" width="4" height="3.2" fill="#C9A86A" opacity="0.6" />
  <rect x="39" y="14" width="4.6" height="3.5" fill="#C9A86A" opacity="0.82" />
  <rect x="45.5" y="14" width="4.6" height="3.5" fill="#222A35" />
  <rect x="52" y="14" width="4.6" height="3.5" fill="#C9A86A" opacity="0.7" />
  <rect x="58" y="14" width="4.2" height="3.5" fill="#222A35" />
  <rect x="39" y="20.5" width="4.6" height="3.5" fill="#222A35" />
  <rect x="45.5" y="20.5" width="4.6" height="3.5" fill="#C9A86A" opacity="0.75" />
  <rect x="52" y="20.5" width="4.6" height="3.5" fill="#222A35" />
  <rect x="58" y="20.5" width="4.2" height="3.5" fill="#C9A86A" opacity="0.65" />
  <rect x="39" y="27" width="4.6" height="3.5" fill="#C9A86A" opacity="0.7" />
  <rect x="45.5" y="27" width="4.6" height="3.5" fill="#222A35" />
  <rect x="52" y="27" width="4.6" height="3.5" fill="#C9A86A" opacity="0.8" />
  <rect x="58" y="27" width="4.2" height="3.5" fill="#222A35" />
  <rect x="39" y="33.5" width="4.6" height="3.5" fill="#222A35" />
  <rect x="45.5" y="33.5" width="4.6" height="3.5" fill="#C9A86A" opacity="0.7" />
  <rect x="52" y="33.5" width="4.6" height="3.5" fill="#222A35" />
  <rect x="58" y="33.5" width="4.2" height="3.5" fill="#222A35" />
  <rect x="47" y="40.5" width="6" height="6" fill="#1C222B" />
</svg>`,

  factory: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <defs>
    <linearGradient id="fac-wall" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#535B64" />
      <stop offset="100%" stop-color="#353B42" />
    </linearGradient>
    <linearGradient id="fac-stack" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6B737C" />
      <stop offset="50%" stop-color="#4E555E" />
      <stop offset="100%" stop-color="#333940" />
    </linearGradient>
  </defs>
  <ellipse cx="40" cy="48.5" rx="31" ry="3.2" fill="#090D14" opacity="0.55" />
  <rect x="16.5" y="8.5" width="5.5" height="22" fill="url(#fac-stack)" stroke="#1B2027" stroke-width="0.65" />
  <rect x="25.5" y="11.5" width="5" height="19" fill="url(#fac-stack)" stroke="#1B2027" stroke-width="0.65" />
  <rect x="16.5" y="11" width="5.5" height="2.4" fill="#9E3A33" />
  <rect x="25.5" y="14" width="5" height="2.1" fill="#9E3A33" />
  <circle cx="20.5" cy="5.5" r="2.8" fill="#8A939E" opacity="0.32" />
  <circle cx="24" cy="4" r="2.2" fill="#8A939E" opacity="0.22" />
  <path d="M11,29 L24,21.5 L24,29 L38,21.5 L38,29 L52,21.5 L52,29 L69,29 L69,47 L11,47 Z" fill="url(#fac-wall)" stroke="#1B2027" stroke-width="0.8" />
  <line x1="11" y1="29" x2="69" y2="29" stroke="#252B32" stroke-width="0.8" />
  <rect x="16" y="36" width="10" height="11" fill="#1A2028" stroke="#363E48" stroke-width="0.7" />
  <line x1="16" y1="39.5" x2="26" y2="39.5" stroke="#2B333D" stroke-width="0.7" />
  <line x1="16" y1="43" x2="26" y2="43" stroke="#2B333D" stroke-width="0.7" />
  <rect x="32" y="33.5" width="12" height="5" fill="#46586B" stroke="#1E252D" stroke-width="0.6" />
  <rect x="49" y="33.5" width="13" height="5" fill="#46586B" stroke="#1E252D" stroke-width="0.6" />
  <rect x="10" y="47" width="60" height="2.8" rx="0.6" fill="#232830" />
</svg>`,

  'gas-station': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <ellipse cx="40" cy="49" rx="31" ry="3" fill="#090D14" opacity="0.55" />
  <rect x="9" y="45.5" width="62" height="3.8" rx="0.8" fill="#2F363E" stroke="#181D23" stroke-width="0.6" />
  <rect x="11" y="14" width="46" height="6.8" rx="1" fill="#B56A24" stroke="#1C2128" stroke-width="0.75" />
  <rect x="11" y="18.2" width="46" height="2.1" fill="#8C4E19" />
  <rect x="17" y="20.8" width="2.8" height="24.7" fill="#5A636E" stroke="#1C2128" stroke-width="0.5" />
  <rect x="48" y="20.8" width="2.8" height="24.7" fill="#5A636E" stroke="#1C2128" stroke-width="0.5" />
  <rect x="26.5" y="31" width="6.5" height="14.5" rx="0.8" fill="#3D4650" stroke="#1C2128" stroke-width="0.65" />
  <rect x="36.5" y="31" width="6.5" height="14.5" rx="0.8" fill="#3D4650" stroke="#1C2128" stroke-width="0.65" />
  <rect x="28" y="33" width="3.5" height="3.2" fill="#4A6C82" />
  <rect x="38" y="33" width="3.5" height="3.2" fill="#4A6C82" />
  <rect x="59.5" y="25" width="11" height="20.5" rx="0.8" fill="#3A424B" stroke="#1C2128" stroke-width="0.7" />
  <rect x="61.5" y="28.5" width="7" height="5" fill="#5D7485" />
  <rect x="60.5" y="11" width="7" height="12.5" rx="0.8" fill="#232931" stroke="#161B21" stroke-width="0.7" />
  <line x1="62" y1="14.5" x2="66" y2="14.5" stroke="#C98A3C" stroke-width="1.3" />
  <line x1="62" y1="18.5" x2="66" y2="18.5" stroke="#538C5C" stroke-width="1.3" />
</svg>`,

  'oil-depot': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <defs>
    <linearGradient id="oil-tank-real" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6F7780" />
      <stop offset="32%" stop-color="#A6AEB7" />
      <stop offset="72%" stop-color="#7B848E" />
      <stop offset="100%" stop-color="#4A525B" />
    </linearGradient>
  </defs>
  <ellipse cx="40" cy="48.5" rx="31" ry="3.2" fill="#090D14" opacity="0.55" />
  <rect x="9" y="43.5" width="62" height="5.2" rx="1" fill="#2B3139" stroke="#171C22" stroke-width="0.7" />
  <rect x="13" y="18" width="19" height="25.5" rx="1.2" fill="url(#oil-tank-real)" stroke="#1E242B" stroke-width="0.75" />
  <ellipse cx="22.5" cy="18" rx="9.5" ry="2.4" fill="#929AA4" stroke="#1E242B" stroke-width="0.65" />
  <rect x="35" y="13.5" width="21" height="30" rx="1.2" fill="url(#oil-tank-real)" stroke="#1E242B" stroke-width="0.75" />
  <ellipse cx="45.5" cy="13.5" rx="10.5" ry="2.7" fill="#9CA5AF" stroke="#1E242B" stroke-width="0.65" />
  <rect x="13" y="25" width="19" height="2.4" fill="#A65529" />
  <rect x="35" y="21.5" width="21" height="2.6" fill="#A65529" />
  <line x1="16" y1="18" x2="16" y2="43.5" stroke="#394048" stroke-width="0.7" />
  <line x1="39" y1="13.5" x2="39" y2="43.5" stroke="#394048" stroke-width="0.7" />
  <path d="M56,36 L65,36 L65,43.5" fill="none" stroke="#8C6239" stroke-width="2.1" />
  <rect x="60" y="29" width="8.5" height="7" rx="0.8" fill="#464E57" stroke="#1C2229" stroke-width="0.7" />
</svg>`,

  'power-plant': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <defs>
    <linearGradient id="cool-tower" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6F7780" />
      <stop offset="40%" stop-color="#949CA6" />
      <stop offset="100%" stop-color="#484F58" />
    </linearGradient>
  </defs>
  <ellipse cx="40" cy="49" rx="31" ry="3" fill="#090D14" opacity="0.55" />
  <path d="M16,46 Q20,28 18.5,12 L33.5,12 Q32,28 36,46 Z" fill="url(#cool-tower)" stroke="#1B2027" stroke-width="0.75" />
  <ellipse cx="26" cy="12" rx="7.5" ry="1.8" fill="#232830" stroke="#1B2027" stroke-width="0.6" />
  <rect x="38" y="26.5" width="29" height="19.5" rx="0.8" fill="#3D444D" stroke="#1B2027" stroke-width="0.75" />
  <rect x="41" y="30" width="9" height="16" fill="#2A3038" stroke="#1B2027" stroke-width="0.6" />
  <line x1="45" y1="13.5" x2="45" y2="26.5" stroke="#6B737D" stroke-width="1.4" />
  <line x1="53" y1="13.5" x2="53" y2="26.5" stroke="#6B737D" stroke-width="1.4" />
  <line x1="61" y1="13.5" x2="61" y2="26.5" stroke="#6B737D" stroke-width="1.4" />
  <line x1="41" y1="16.5" x2="65" y2="16.5" stroke="#9EA6B0" stroke-width="0.9" />
  <line x1="41" y1="20.5" x2="65" y2="20.5" stroke="#858D96" stroke-width="0.8" />
  <polygon points="56,31 52,37.5 55.2,37.5 53.6,43 59.5,35.5 56,35.5" fill="#C9A33E" />
  <rect x="10" y="46" width="60" height="3.2" rx="0.6" fill="#22272F" />
</svg>`,

  'ammo-depot': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <defs>
    <linearGradient id="bunker-arch" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#55614C" />
      <stop offset="100%" stop-color="#353E30" />
    </linearGradient>
  </defs>
  <ellipse cx="40" cy="48.5" rx="31" ry="3.2" fill="#090D14" opacity="0.55" />
  <path d="M12,45.5 L12,28 Q40,10 68,28 L68,45.5 Z" fill="url(#bunker-arch)" stroke="#1A2018" stroke-width="0.8" />
  <path d="M18,45.5 L18,30 Q40,16 62,30 L62,45.5 Z" fill="#464E43" stroke="#1E241C" stroke-width="0.7" />
  <rect x="26" y="31.5" width="28" height="14" fill="#181D24" stroke="#2D343D" stroke-width="0.7" />
  <rect x="29.5" y="36" width="8.5" height="9.5" fill="#4B5743" stroke="#1F261C" stroke-width="0.65" />
  <rect x="41.5" y="36" width="8.5" height="9.5" fill="#4B5743" stroke="#1F261C" stroke-width="0.65" />
  <rect x="30.5" y="38.5" width="6.5" height="1.4" fill="#2F382A" />
  <rect x="42.5" y="38.5" width="6.5" height="1.4" fill="#2F382A" />
  <polygon points="40,21.5 43.5,27 36.5,27" fill="#9E3A33" stroke="#1A1F24" stroke-width="0.5" />
  <rect x="9" y="45.5" width="62" height="3.6" rx="0.6" fill="#242B21" />
</svg>`,

  port: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <ellipse cx="40" cy="50" rx="33" ry="2.8" fill="#070B11" opacity="0.55" />
  <rect x="6" y="41.5" width="68" height="9.5" rx="1" fill="#1C3D52" stroke="#122736" stroke-width="0.7" />
  <path d="M8,45.5 Q18,44 28,45.5 T48,45.5 T68,45.5" fill="none" stroke="#4D7D99" stroke-width="0.9" opacity="0.6" />
  <rect x="7" y="34" width="38" height="8" rx="0.8" fill="#4B525A" stroke="#1B2027" stroke-width="0.75" />
  <line x1="19" y1="34" x2="19" y2="11" stroke="#36627D" stroke-width="1.9" />
  <line x1="25" y1="34" x2="25" y2="11" stroke="#36627D" stroke-width="1.9" />
  <line x1="14" y1="13" x2="43" y2="13" stroke="#4B7B99" stroke-width="2" stroke-linecap="round" />
  <line x1="22" y1="7" x2="40" y2="13" stroke="#6E7782" stroke-width="0.85" />
  <line x1="22" y1="7" x2="16" y2="13" stroke="#6E7782" stroke-width="0.85" />
  <line x1="35" y1="13" x2="35" y2="23" stroke="#9AA3AD" stroke-width="0.9" />
  <rect x="31.5" y="23" width="7" height="4.2" rx="0.5" fill="#9E562E" stroke="#1C2128" stroke-width="0.5" />
  <rect x="9.5" y="27" width="7.5" height="7" fill="#8C3732" stroke="#1B2027" stroke-width="0.5" />
  <rect x="9.5" y="20" width="7.5" height="7" fill="#325375" stroke="#1B2027" stroke-width="0.5" />
  <path d="M44,33.5 L69,33.5 L73,37.5 L67.5,42 L46,42 L43,38 Z" fill="#2A313A" stroke="#15191E" stroke-width="0.8" />
  <rect x="47.5" y="28.5" width="9" height="5" fill="#9E562E" stroke="#1B2027" stroke-width="0.5" />
  <rect x="56.5" y="28.5" width="6" height="5" fill="#365C78" stroke="#1B2027" stroke-width="0.5" />
  <rect x="62.5" y="24" width="6.2" height="9.5" rx="0.6" fill="#9AA3AD" stroke="#1B2027" stroke-width="0.6" />
  <rect x="64.5" y="26" width="2.5" height="2.2" fill="#181D24" />
</svg>`,

  'military-base': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <ellipse cx="40" cy="48.5" rx="31" ry="3.2" fill="#090D14" opacity="0.55" />
  <rect x="10" y="45" width="60" height="3.8" rx="0.6" fill="#2A3028" />
  <rect x="13" y="25" width="24" height="20" rx="0.8" fill="#4D5742" stroke="#1E2419" stroke-width="0.75" />
  <rect x="13" y="23.5" width="24" height="2.4" fill="#38402F" />
  <rect x="17" y="30" width="5" height="4" fill="#1F261A" />
  <rect x="26" y="30" width="5" height="4" fill="#1F261A" />
  <rect x="41" y="21" width="26" height="24" rx="0.8" fill="#59634B" stroke="#1E2419" stroke-width="0.75" />
  <path d="M41,21 L54,14 L67,21 Z" fill="#434C39" stroke="#1E2419" stroke-width="0.7" />
  <rect x="48" y="33" width="12" height="12" fill="#1F251C" stroke="#2D3529" stroke-width="0.6" />
  <rect x="29" y="10" width="2" height="15" fill="#6F7A68" />
  <polygon points="31,10 38,12 31,14" fill="#3B82F6" />
</svg>`,

  metallurgy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <ellipse cx="40" cy="48.5" rx="31" ry="3.2" fill="#090D14" opacity="0.55" />
  <rect x="10" y="45.5" width="60" height="3.2" fill="#262B32" />
  <rect x="14" y="12" width="11" height="33.5" rx="0.8" fill="#5C626B" stroke="#1A1F26" stroke-width="0.75" />
  <rect x="28" y="15" width="10" height="30.5" rx="0.8" fill="#50565F" stroke="#1A1F26" stroke-width="0.75" />
  <rect x="14" y="18" width="11" height="2.2" fill="#B8562C" />
  <rect x="28" y="21" width="10" height="2.2" fill="#B8562C" />
  <rect x="41" y="25" width="26" height="20.5" rx="0.8" fill="#424852" stroke="#1A1F26" stroke-width="0.75" />
  <path d="M41,25 L54,19 L67,25 Z" fill="#525965" stroke="#1A1F26" stroke-width="0.7" />
  <rect x="46" y="34" width="8" height="11.5" fill="#1F1612" />
  <rect x="47.5" y="38" width="5" height="6" fill="#D97724" opacity="0.85" />
</svg>`,

  'railway-hub': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <ellipse cx="40" cy="48.5" rx="31" ry="3.2" fill="#090D14" opacity="0.55" />
  <rect x="9" y="44" width="62" height="4.5" fill="#282E36" />
  <line x1="9" y1="45.2" x2="71" y2="45.2" stroke="#7E8894" stroke-width="1" />
  <line x1="9" y1="47.2" x2="71" y2="47.2" stroke="#7E8894" stroke-width="1" />
  <rect x="12" y="26" width="32" height="18" rx="0.8" fill="#58616B" stroke="#1B2027" stroke-width="0.75" />
  <path d="M10,26 L28,17 L46,26 Z" fill="#3D4652" stroke="#1B2027" stroke-width="0.7" />
  <rect x="17" y="31" width="6" height="5" fill="#C9A86A" opacity="0.75" />
  <rect x="25" y="31" width="6" height="5" fill="#C9A86A" opacity="0.75" />
  <rect x="33" y="31" width="6" height="5" fill="#27313D" />
  <rect x="48" y="33" width="19" height="9" rx="1" fill="#3C5770" stroke="#182028" stroke-width="0.7" />
  <rect x="50" y="35" width="4" height="3" fill="#89A4BA" />
  <rect x="56" y="35" width="4" height="3" fill="#89A4BA" />
</svg>`,

  'command-center': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <ellipse cx="40" cy="48.5" rx="31" ry="3.2" fill="#090D14" opacity="0.55" />
  <rect x="12" y="45" width="56" height="3.8" fill="#222830" />
  <rect x="15" y="24" width="50" height="21" rx="0.8" fill="#46505C" stroke="#1A2028" stroke-width="0.75" />
  <rect x="14" y="21.5" width="52" height="3" fill="#313942" stroke="#1A2028" stroke-width="0.65" />
  <line x1="27" y1="8" x2="27" y2="21.5" stroke="#85909C" stroke-width="1.4" />
  <circle cx="27" cy="8" r="2.2" fill="#38BDF8" />
  <path d="M46,19 Q52,11 58,19 Z" fill="#6F7A86" stroke="#1E242C" stroke-width="0.7" />
  <line x1="52" y1="15" x2="56" y2="10" stroke="#9AA4AF" stroke-width="1" />
  <rect x="20" y="29" width="8" height="4" fill="#38BDF8" opacity="0.75" />
  <rect x="32" y="29" width="8" height="4" fill="#38BDF8" opacity="0.6" />
  <rect x="44" y="29" width="8" height="4" fill="#232B35" />
  <rect x="35" y="37" width="10" height="8" fill="#1C222A" />
</svg>`,

  bridge: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56">
  <ellipse cx="40" cy="49" rx="33" ry="2.8" fill="#070B11" opacity="0.55" />
  <rect x="6" y="40" width="68" height="10" rx="1" fill="#1D4057" stroke="#122736" stroke-width="0.7" />
  <rect x="19" y="27" width="4.5" height="19" fill="#5D6670" stroke="#1B2027" stroke-width="0.6" />
  <rect x="56.5" y="27" width="4.5" height="19" fill="#5D6670" stroke="#1B2027" stroke-width="0.6" />
  <rect x="20" y="13" width="2.8" height="16" fill="#7D8792" stroke="#1B2027" stroke-width="0.55" />
  <rect x="57.2" y="13" width="2.8" height="16" fill="#7D8792" stroke="#1B2027" stroke-width="0.55" />
  <line x1="21.4" y1="14" x2="8" y2="28" stroke="#9DA7B2" stroke-width="0.75" />
  <line x1="21.4" y1="14" x2="36" y2="28" stroke="#9DA7B2" stroke-width="0.75" />
  <line x1="58.6" y1="14" x2="44" y2="28" stroke="#9DA7B2" stroke-width="0.75" />
  <line x1="58.6" y1="14" x2="72" y2="28" stroke="#9DA7B2" stroke-width="0.75" />
  <rect x="6" y="27.5" width="68" height="4.2" fill="#4A525C" stroke="#181D24" stroke-width="0.7" />
</svg>`,
};

export const BUILDING_SVG_DATA_URLS: Record<BuildingId, string> = {
  residential: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP.residential)}`,
  factory: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP.factory)}`,
  'gas-station': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP['gas-station'])}`,
  'oil-depot': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP['oil-depot'])}`,
  'power-plant': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP['power-plant'])}`,
  'ammo-depot': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP['ammo-depot'])}`,
  port: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP.port)}`,
  'military-base': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP['military-base'])}`,
  metallurgy: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP.metallurgy)}`,
  'railway-hub': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP['railway-hub'])}`,
  'command-center': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP['command-center'])}`,
  bridge: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDING_SVG_MARKUP.bridge)}`,
};

const imageCache: Partial<Record<BuildingId, HTMLImageElement>> = {};

export function getBuildingCanvasImage(id: BuildingId): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = imageCache[id];
  if (!img) {
    img = new Image();
    img.src = BUILDING_SVG_DATA_URLS[id];
    imageCache[id] = img;
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
