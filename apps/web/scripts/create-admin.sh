#!/bin/zsh
# Crea (o recupera) una cuenta de Administración en Konnexa.
# Pregunta los datos aquí mismo; la contraseña no se ve ni queda en el historial.
#
#   npm run create-admin
set -e
cd "$(dirname "$0")/.."

echo ""
echo "  Crear una cuenta de Administración en Konnexa"
echo "  ─────────────────────────────────────────────"
read "email?  Tu correo: "
read "name?  Tu nombre: "
read -s "pass?  Contraseña (mínimo 8 caracteres, no se verá al escribir): "; echo
read -s "pass2?  Repite la contraseña: "; echo

if [ "$pass" != "$pass2" ]; then echo "\n  Las contraseñas no coinciden. Vuelve a intentarlo."; exit 1; fi
if [ ${#pass} -lt 8 ]; then echo "\n  La contraseña debe tener al menos 8 caracteres."; exit 1; fi

ADMIN_PASSWORD="$pass" ./_run.sh npx tsx scripts/seed-admin.ts "$email" "$name"
