// UI translations. English text is the key: t("Build order") → "Orden de compra" in Spanish.
// Shared components (Card titles, Toggle labels, Segmented options, Empty states, the sidebar,
// Settings tabs, hover tips) call t() themselves, so most of the interface follows the language
// without touching every view. Missing entries fall back to English. Champion / item / augment
// names stay as Riot publishes them in English.
import type { ReactNode } from "react";

export type Lang = "en" | "es" | "pt";
export const LANGUAGES: Array<{ value: Lang; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português (BR)" },
];

let current: Lang = "en";
export const setLanguage = (l: Lang) => {
  current = LANGUAGES.some((x) => x.value === l) ? l : "en";
};
export const getLanguage = () => current;

/** Translate an English UI string (unchanged when there's no translation). */
export function t(s: string): string {
  if (current === "en") return s;
  const e = DICT[s];
  return e ? e[current === "es" ? 0 : 1] : s;
}
/** t() for ReactNode props that are often plain strings. */
export function tn(n: ReactNode): ReactNode {
  return typeof n === "string" ? t(n) : n;
}

// [Spanish, Portuguese (BR)]
const DICT: Record<string, [string, string]> = {
  // Sidebar / tabs
  Home: ["Inicio", "Início"],
  Build: ["Build", "Build"],
  Augments: ["Aumentos", "Aumentos"],
  Guide: ["Guía", "Guia"],
  Tiers: ["Tiers", "Tiers"],
  Players: ["Jugadores", "Jogadores"],
  History: ["Historial", "Histórico"],
  Settings: ["Ajustes", "Configurações"],
  Demo: ["Demo", "Demo"],
  General: ["General", "Geral"],
  Hotkeys: ["Atajos", "Atalhos"],
  Appearance: ["Apariencia", "Aparência"],
  "In-game overlay": ["Overlay en partida", "Overlay na partida"],
  Data: ["Datos", "Dados"],
  Diagnostics: ["Diagnóstico", "Diagnóstico"],
  About: ["Acerca de", "Sobre"],

  // Common
  Auto: ["Auto", "Auto"],
  Aggressive: ["Agresivo", "Agressivo"],
  Balanced: ["Equilibrado", "Equilibrado"],
  Safe: ["Seguro", "Seguro"],
  Frontline: ["Primera línea", "Linha de frente"],
  Top: ["Top", "Top"],
  Jungle: ["Jungla", "Selva"],
  Mid: ["Medio", "Meio"],
  ADC: ["ADC", "ADC"],
  Support: ["Soporte", "Suporte"],
  Role: ["Rol", "Função"],
  "Data source": ["Fuente de datos", "Fonte de dados"],
  "My games": ["Mis partidas", "Minhas partidas"],
  "My dataset": ["Mi dataset", "Meu dataset"],
  Baseline: ["Base", "Base"],
  Minimal: ["Mínimo", "Mínimo"],
  Full: ["Completo", "Completo"],
  Custom: ["Personalizado", "Personalizado"],
  Compact: ["Compacto", "Compacto"],
  Comfortable: ["Cómodo", "Confortável"],
  Table: ["Tabla", "Tabela"],
  "Above cards": ["Sobre las cartas", "Acima das cartas"],
  "Below cards": ["Bajo las cartas", "Abaixo das cartas"],
  Off: ["Apagado", "Desligado"],
  Fade: ["Atenuar", "Esmaecer"],
  Hide: ["Ocultar", "Ocultar"],
  Share: ["Compartir", "Compartilhar"],
  "Paste code": ["Pegar código", "Colar código"],
  Import: ["Importar", "Importar"],
  "All champions": ["Todos los campeones", "Todos os campeões"],
  "Change champion": ["Cambiar campeón", "Trocar campeão"],
  Reset: ["Restablecer", "Redefinir"],
  "Got it": ["Entendido", "Entendi"],
  Done: ["Listo", "Pronto"],
  "Save image": ["Guardar imagen", "Salvar imagem"],
  "Copy image": ["Copiar imagen", "Copiar imagem"],
  "Open history": ["Abrir historial", "Abrir histórico"],
  "Export CSV": ["Exportar CSV", "Exportar CSV"],
  "Copy for spreadsheet": ["Copiar para hoja de cálculo", "Copiar para planilha"],
  Backup: ["Copia de seguridad", "Backup"],
  "Import to League": ["Importar a League", "Importar para o League"],
  "Scan screen": ["Escanear pantalla", "Escanear tela"],
  "What's new in Nexis": ["Novedades de Nexis", "Novidades do Nexis"],

  // Card titles
  "A quiet patch": ["Un parche tranquilo", "Um patch tranquilo"],
  "Add a favorite": ["Añadir favorito", "Adicionar favorito"],
  App: ["Aplicación", "Aplicativo"],
  "Augment detection calibration": ["Calibración de detección de aumentos", "Calibração da detecção de aumentos"],
  Boots: ["Botas", "Botas"],
  "Build order": ["Orden de compra", "Ordem de compra"],
  Builds: ["Builds", "Builds"],
  "Champion tiers": ["Tiers de campeones", "Tiers de campeões"],
  Champions: ["Campeones", "Campeões"],
  Combos: ["Combos", "Combos"],
  "Damage profile": ["Perfil de daño", "Perfil de dano"],
  "Data & credits": ["Datos y créditos", "Dados e créditos"],
  "Duo partners": ["Compañeros de dúo", "Parceiros de duo"],
  "Enemy power spikes": ["Picos de poder enemigos", "Picos de poder inimigos"],
  "Enemy team": ["Equipo enemigo", "Time inimigo"],
  "Event log": ["Registro de eventos", "Registro de eventos"],
  "Fair play": ["Juego limpio", "Jogo limpo"],
  Favorites: ["Favoritos", "Favoritos"],
  "Game intel": ["Información de la partida", "Informações da partida"],
  "Game plan": ["Plan de juego", "Plano de jogo"],
  "Grow your pool": ["Amplía tu pool", "Amplie seu pool"],
  "In-game layer": ["Capa en partida", "Camada na partida"],
  "Item gold per player": ["Oro en objetos por jugador", "Ouro em itens por jogador"],
  Keybinds: ["Teclas", "Teclas"],
  "Keyboard shortcuts": ["Atajos de teclado", "Atalhos de teclado"],
  "Late-game swaps": ["Cambios de final de partida", "Trocas de fim de jogo"],
  Layout: ["Diseño", "Layout"],
  "League client": ["Cliente de League", "Cliente do League"],
  "Look for next": ["Busca a continuación", "Procure em seguida"],
  Matches: ["Partidas", "Partidas"],
  "Matchup coach": ["Coach de enfrentamiento", "Coach de confronto"],
  Matchups: ["Enfrentamientos", "Confrontos"],
  "Mini HUD": ["Mini HUD", "Mini HUD"],
  "Offered now": ["Ofrecidos ahora", "Oferecidos agora"],
  "Overlay behavior": ["Comportamiento del overlay", "Comportamento do overlay"],
  "Patch changes for you": ["Cambios del parche para ti", "Mudanças do patch para você"],
  "Patch movers": ["Movimientos del parche", "Destaques do patch"],
  "Prismatic items": ["Objetos prismáticos", "Itens prismáticos"],
  "Quick actions": ["Acciones rápidas", "Ações rápidas"],
  "Quick reference": ["Referencia rápida", "Referência rápida"],
  Roles: ["Roles", "Funções"],
  Runes: ["Runas", "Runas"],
  "Shop now": ["Comprar ahora", "Comprar agora"],
  "Situational counters": ["Counters situacionales", "Counters situacionais"],
  "Skill order": ["Orden de habilidades", "Ordem de habilidades"],
  "Starting gold": ["Oro inicial", "Ouro inicial"],
  "Stats sources": ["Fuentes de estadísticas", "Fontes de estatísticas"],
  Status: ["Estado", "Status"],
  "Team comps": ["Composiciones", "Composições"],
  "Team power": ["Poder del equipo", "Poder do time"],
  Teammates: ["Compañeros", "Companheiros"],
  Theme: ["Tema", "Tema"],
  Threats: ["Amenazas", "Ameaças"],
  "Tier badges": ["Insignias de tier", "Selos de tier"],
  "Tier list": ["Lista de tiers", "Lista de tiers"],
  "Top picks this patch": ["Mejores picks del parche", "Melhores picks do patch"],
  "Weapon burn order": ["Orden de armas", "Ordem das armas"],
  "Win rate trend": ["Tendencia de victorias", "Tendência de vitórias"],
  Window: ["Ventana", "Janela"],
  "Window size & position": ["Tamaño y posición de la ventana", "Tamanho e posição da janela"],
  "Your augments this game": ["Tus aumentos en esta partida", "Seus aumentos nesta partida"],
  "Your best augments": ["Tus mejores aumentos", "Seus melhores aumentos"],
  "Your best items": ["Tus mejores objetos", "Seus melhores itens"],
  "Your best picks": ["Tus mejores picks", "Seus melhores picks"],
  "Your data & safety": ["Tus datos y seguridad", "Seus dados e segurança"],
  "Your recent form": ["Tu forma reciente", "Sua forma recente"],

  // Empty states
  "Pick a champion to see a build": ["Elige un campeón para ver una build", "Escolha um campeão para ver uma build"],
  "Pick a champion to see a guide": ["Elige un campeón para ver una guía", "Escolha um campeão para ver um guia"],
  "No enemy team yet": ["Aún no hay equipo enemigo", "Ainda não há time inimigo"],
  "No games recorded yet": ["Aún no hay partidas registradas", "Ainda não há partidas registradas"],
  "No games match these filters": ["Ninguna partida coincide con los filtros", "Nenhuma partida corresponde aos filtros"],
  "Nothing offered right now": ["No hay nada ofrecido ahora", "Nada oferecido agora"],
  "No urgent counters": ["Sin counters urgentes", "Sem counters urgentes"],
  "No augments match": ["Ningún aumento coincide", "Nenhum aumento corresponde"],
  "No previous patch yet": ["Aún no hay parche anterior", "Ainda não há patch anterior"],
  "No tier data yet": ["Aún no hay datos de tiers", "Ainda não há dados de tiers"],

  // Settings switches
  "Keep Nexis on top": ["Mantener Nexis encima", "Manter o Nexis no topo"],
  "Streamer mode": ["Modo streamer", "Modo streamer"],
  "Start hidden in the tray": ["Iniciar oculto en la bandeja", "Iniciar oculto na bandeja"],
  "Hide when the game starts": ["Ocultar al empezar la partida", "Ocultar ao iniciar a partida"],
  "Post-game summary": ["Resumen post-partida", "Resumo pós-partida"],
  "Launch with Windows": ["Iniciar con Windows", "Iniciar com o Windows"],
  "In-game HUD": ["HUD en partida", "HUD na partida"],
  "Auto-detect augments": ["Detectar aumentos automáticamente", "Detectar aumentos automaticamente"],
  "Detect your pick": ["Detectar tu elección", "Detectar sua escolha"],
  "Augment pick reminder": ["Recordatorio de elección de aumento", "Lembrete de escolha de aumento"],
  "Shop view while dead": ["Vista de tienda al morir", "Visão da loja ao morrer"],
  "Separate layout per mode": ["Diseño separado por modo", "Layout separado por modo"],
  "Collapse to a pill": ["Contraer a una píldora", "Recolher em uma pílula"],
  "Full-view hint": ["Pista de vista completa", "Dica de visão completa"],
  "Lock position": ["Bloquear posición", "Travar posição"],
  "See-through window": ["Ventana transparente", "Janela transparente"],
  "Use live web stats": ["Usar estadísticas web en vivo", "Usar estatísticas da web ao vivo"],
  "Import rune pages": ["Importar páginas de runas", "Importar páginas de runas"],
  "Import item sets": ["Importar sets de objetos", "Importar conjuntos de itens"],
  "Import automatically in champ select": ["Importar automáticamente en la selección", "Importar automaticamente na seleção"],
  "Preview on the game screen": ["Vista previa en la pantalla del juego", "Prévia na tela do jogo"],
  "Default playstyle": ["Estilo de juego por defecto", "Estilo de jogo padrão"],
  "Badge position": ["Posición de las insignias", "Posição dos selos"],
  "Badge size": ["Tamaño de las insignias", "Tamanho dos selos"],
  "Badge vertical offset": ["Desplazamiento vertical", "Deslocamento vertical"],
  "HUD size": ["Tamaño del HUD", "Tamanho do HUD"],
  "Panel opacity": ["Opacidad del panel", "Opacidade do painel"],
  "Opacity on hover": ["Opacidad al pasar el ratón", "Opacidade ao passar o mouse"],
  "UI scale": ["Escala de la interfaz", "Escala da interface"],
  Density: ["Densidad", "Densidade"],
  "Corner radius": ["Radio de esquinas", "Raio dos cantos"],
  "Accent color": ["Color de acento", "Cor de destaque"],
  Language: ["Idioma", "Idioma"],
  Look: ["Aspecto", "Aparência"],

  // Settings descriptions
  "Hides every player name and Riot ID (players show as their champion), so Nexis is safe to show on stream": [
    "Oculta todos los nombres y Riot ID (se muestran como su campeón), para poder mostrar Nexis en directo",
    "Oculta todos os nomes e Riot IDs (aparecem como o campeão), para mostrar o Nexis em live com segurança",
  ],
  "Launch quietly; open with the hotkey, the tray icon or champ select": [
    "Inicia en silencio; ábrelo con el atajo, el icono de la bandeja o en la selección",
    "Inicia em silêncio; abra pelo atalho, pelo ícone da bandeja ou na seleção",
  ],
  "Opens a short recap of your game when it ends": ["Abre un breve resumen al terminar la partida", "Abre um breve resumo quando a partida termina"],
  "Adds Nexis to your Windows startup apps (removed again when you turn this off)": [
    "Añade Nexis a las aplicaciones de inicio de Windows (se quita al desactivarlo)",
    "Adiciona o Nexis aos apps de inicialização do Windows (removido ao desativar)",
  ],
  "Shows tier badges on the augment cards automatically": ["Muestra insignias de tier sobre las cartas de aumento", "Mostra selos de tier nas cartas de aumento"],
  "Marks the augment you choose when only that card is left on screen (reads the screen only, never your mouse)": [
    "Marca el aumento que eliges cuando solo queda esa carta en pantalla (solo lee la pantalla, nunca tu ratón)",
    "Marca o aumento escolhido quando só essa carta fica na tela (lê só a tela, nunca o mouse)",
  ],
  "When augment cards are detected, a reminder to mark your pick in Nexis shows for ~8 seconds": [
    "Al detectar cartas de aumento, aparece ~8 segundos un recordatorio para marcar tu elección",
    "Ao detectar cartas de aumento, aparece por ~8 segundos um lembrete para marcar sua escolha",
  ],
  "While you're dead the HUD opens up with the shop first (and your respawn time), then goes back to your layout": [
    "Mientras estás muerto el HUD se abre con la tienda primero (y tu tiempo de reaparición) y luego vuelve a tu diseño",
    "Enquanto você está morto o HUD abre com a loja primeiro (e o tempo de renascimento) e depois volta ao seu layout",
  ],
  "Icons only — a narrow strip with no labels": ["Solo iconos: una franja estrecha sin texto", "Só ícones: uma faixa estreita sem texto"],
  "Just the next buy (and a skill point reminder) in a tiny pill": [
    "Solo la próxima compra (y un aviso de punto de habilidad) en una pequeña píldora",
    "Só a próxima compra (e um lembrete de ponto de habilidade) em uma pequena pílula",
  ],
  "Turns off dragging the top bar and resizing from the edges": ["Desactiva arrastrar la barra superior y redimensionar desde los bordes", "Desativa arrastar a barra superior e redimensionar pelas bordas"],


  // Settings details
  "Full overlay": ["Overlay completo", "Overlay completo"],
  "Don't open": ["No abrir", "Não abrir"],
  "Nothing opens in champ select; use the hotkey when you want it.": ["No se abre nada en la selección; usa el atajo cuando lo quieras.", "Nada abre na seleção; use o atalho quando quiser."],
  "Opens the full overlay with the pick helper and your build.": ["Abre el overlay completo con el asistente de picks y tu build.", "Abre o overlay completo com o assistente de picks e sua build."],
  "A small window at the side with your build and skill order — it doesn't cover champ select. Expand (or the hotkey) opens the full overlay.": [
    "Una ventana pequeña al lado con tu build y orden de habilidades: no tapa la selección. Ampliar (o el atajo) abre el overlay completo.",
    "Uma janela pequena ao lado com sua build e ordem de habilidades: não cobre a seleção. Expandir (ou o atalho) abre o overlay completo.",
  ],
  "Also switchable from the top bar.": ["También se cambia desde la barra superior.", "Também dá para trocar na barra superior."],
  "Menus, cards and settings. Champion, item and augment names stay in English.": [
    "Menús, tarjetas y ajustes. Los nombres de campeones, objetos y aumentos siguen en inglés.",
    "Menus, cards e configurações. Nomes de campeões, itens e aumentos continuam em inglês.",
  ],
  "Keeps the Nexis window above all other windows. Off: it behaves like a normal window and goes behind whatever you click (the in-game HUD always stays over the game).": [
    "Mantiene la ventana de Nexis sobre las demás. Apagado: se comporta como una ventana normal y queda detrás de lo que pulses (el HUD en partida siempre queda sobre el juego).",
    "Mantém a janela do Nexis acima das outras. Desligado: age como uma janela normal e fica atrás do que você clicar (o HUD na partida sempre fica sobre o jogo).",
  ],
  "Picks a style for you as the game goes: safer when you're dying a lot, more damage when you're ahead": [
    "Elige un estilo según la partida: más seguro si mueres mucho, más daño si vas por delante",
    "Escolhe um estilo conforme a partida: mais seguro se você morre muito, mais dano quando está na frente",
  ],
  "Leans into damage: defensive counter items only when the threat is big": ["Prioriza el daño: objetos defensivos solo ante amenazas grandes", "Foca em dano: itens defensivos só contra ameaças grandes"],
  "An even mix: buy whatever counter the enemy team calls for most": ["Mezcla equilibrada: compra el counter que más pida el equipo enemigo", "Mistura equilibrada: compre o counter que o time inimigo mais exige"],
  "Survive first: defensive items against their burst and crowd control come earlier": ["Sobrevivir primero: los objetos defensivos contra su burst y control llegan antes", "Sobreviver primeiro: itens defensivos contra burst e controle vêm antes"],
  "Built to absorb damage for your team: tankier counters, a bit less damage": ["Para absorber daño por tu equipo: counters más tanques, algo menos de daño", "Feito para absorver dano pelo time: counters mais tanques, um pouco menos de dano"],
  "Client not detected": ["Cliente no detectado", "Cliente não detectado"],
  "Show / hide overlay": ["Mostrar / ocultar overlay", "Mostrar / ocultar overlay"],
  "Scan augments": ["Escanear aumentos", "Escanear aumentos"],
  "Toggle in-game HUD": ["Activar/desactivar HUD", "Ligar/desligar HUD"],
  "Never covers your screen at spawn — reopen any time with": ["Nunca tapa tu pantalla al aparecer; vuelve a abrirlo cuando quieras con", "Nunca cobre sua tela no início; reabra quando quiser com"],

  "Discord status": ["Estado de Discord", "Status do Discord"],
  "Show on Discord": ["Mostrar en Discord", "Mostrar no Discord"],
  "Discord application ID": ["ID de aplicación de Discord", "ID do aplicativo do Discord"],

  // Hover tips & misc
  "Browse every champion": ["Ver todos los campeones", "Ver todos os campeões"],
  "Show another champion's guide": ["Ver la guía de otro campeón", "Ver o guia de outro campeão"],
  "Copy a code with this build's picks to share": ["Copia un código con las elecciones de esta build para compartir", "Copia um código com as escolhas desta build para compartilhar"],
  "Import a build code from a friend": ["Importa el código de build de un amigo", "Importe o código de build de um amigo"],
  "Try the overlay with a sample in-game state": ["Prueba el overlay con una partida de ejemplo", "Teste o overlay com uma partida de exemplo"],
  "Turn off the demo game": ["Apagar la partida demo", "Desligar a partida demo"],
};
