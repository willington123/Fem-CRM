"""
Genera los archivos del logo de Konnexa a partir del logo original (PNG o WebP
con fondo transparente):

    python3 scripts/make-logo-assets.py ruta/al/logo-konnexa.webp

Crea, desde la carpeta apps/web:
  public/konnexa-logo.png        logo completo a color (para fondos claros)
  public/konnexa-logo-white.png  el mismo con las letras en blanco (fondos oscuros)
  public/konnexa-icon.png        solo la K con la burbuja, cuadrado, 256 px
  src/app/icon.png               ícono de la pestaña del navegador, 512 px

Requiere Pillow (pip install pillow).
"""
import sys
from PIL import Image


def trim(img, threshold=20):
    alpha = img.getchannel('A').point(lambda v: 255 if v > threshold else 0)
    return img.crop(alpha.getbbox())


def is_lettering(r, g, b):
    # Las letras son azul marino casi negro; el ícono es azul brillante, cian o verde.
    return max(r, g, b) < 90 and b < 110


def main(src):
    im = Image.open(src).convert('RGBA')
    full = trim(im)

    def save_wide(img, path, width=900):
        w, h = img.size
        img.resize((width, round(h * width / w)), Image.LANCZOS).save(path, optimize=True)

    save_wide(full, 'public/konnexa-logo.png')

    white = full.copy()
    px = white.load()
    for y in range(white.size[1]):
        for x in range(white.size[0]):
            r, g, b, a = px[x, y]
            if a and is_lettering(r, g, b):
                px[x, y] = (255, 255, 255, a)
    save_wide(white, 'public/konnexa-logo-white.png')

    # El ícono ocupa el primer ~28 % del ancho; la K de la palabra empieza
    # justo después y se borra por color.
    W, H = im.size
    left, right = int(W * 0.05), int(W * 0.30)
    mark = im.crop((left, int(H * 0.09), right, int(H * 0.90))).copy()
    px = mark.load()
    cut = int(W * 0.2575) - left
    for y in range(mark.size[1]):
        for x in range(cut, mark.size[0]):
            r, g, b, a = px[x, y]
            if a and is_lettering(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    mark = trim(mark, 30)

    side = max(mark.size)
    side += 2 * int(side * 0.06)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(mark, ((side - mark.size[0]) // 2, (side - mark.size[1]) // 2), mark)
    square.resize((256, 256), Image.LANCZOS).save('public/konnexa-icon.png', optimize=True)
    square.resize((512, 512), Image.LANCZOS).save('src/app/icon.png', optimize=True)
    print('Listo: public/konnexa-*.png y src/app/icon.png')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Uso: python3 scripts/make-logo-assets.py ruta/al/logo.webp')
    main(sys.argv[1])
