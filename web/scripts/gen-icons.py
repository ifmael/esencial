# Regenera src/components/icons.tsx desde los SVG oficiales de Material Symbols
# Rounded (peso 400, grado 0, tamaño óptico 24; contorno y FILL 1).
#   python3 web/scripts/gen-icons.py
# Para añadir un icono: nombre exportado → nombre del símbolo en ICONS.
import json, re, urllib.request, pathlib

ICONS = {
    "CalendarIcon": "today", "DumbbellIcon": "fitness_center", "UtensilsIcon": "restaurant",
    "ChevronDownIcon": "expand_more", "ChevronLeftIcon": "chevron_left", "ChevronRightIcon": "chevron_right",
    "CloudIcon": "cloud", "CheckIcon": "check", "LeafIcon": "eco",
    "SwatchIcon": "palette", "GripIcon": "drag_indicator", "HomeIcon": "home", "BookIcon": "menu_book",
    "ListIcon": "lists", "LightIcon": "light_mode", "DarkIcon": "dark_mode", "ContrastIcon": "contrast",
    "CloseIcon": "close", "AddIcon": "add", "SearchIcon": "search", "UndoIcon": "undo",
    "DeleteIcon": "delete", "EditIcon": "edit", "CartIcon": "shopping_cart", "FireIcon": "local_fire_department",
    "PlayIcon": "play_arrow", "PauseIcon": "pause", "BackIcon": "arrow_back",
    "SaveIcon": "save", "TimerIcon": "timer",
    "RunIcon": "directions_run", "BikeIcon": "pedal_bike", "MoreIcon": "more_vert",
    "DropDownIcon": "arrow_drop_down", "EventIcon": "event_available", "CopyIcon": "content_copy",
    "NotesIcon": "notes", "PhotoIcon": "photo_camera", "MonthIcon": "calendar_month", "ScheduleIcon": "schedule",
    "SettingsIcon": "settings",
}
URL = "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/{}/{}/24px.svg"

def path(sym, variant):
    svg = urllib.request.urlopen(URL.format(sym, variant)).read().decode()
    return re.search(r' d="([^"]+)"', svg).group(1)

HEAD = pathlib.Path(__file__).with_name("icons-head.tsx.txt").read_text()
out = [HEAD]
for name, sym in ICONS.items():
    o, f = path(sym, "default"), path(sym, "fill1")
    args = f'"{o}",' if o == f else f'"{o}",\n  "{f}",'
    out.append(f"export const {name} = icon(\n  {args}\n);\n")
pathlib.Path(__file__).parent.joinpath("../src/components/icons.tsx").write_text("\n".join(out))
