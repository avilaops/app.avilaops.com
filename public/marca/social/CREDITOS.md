# Logotipos de terceiros

Arquivos usados pelo componente `LogoSocial` (`src/components/ui/LogoSocial.tsx`)
para identificar o provedor de uma integração ou de uma chave do cofre.

Todos vieram do Wikimedia Commons em 19/09/2026, em SVG, sem redesenho. Marca de
terceiro não se recria à mão: um traço diferente do oficial é uso indevido, e a
versão vetorial publicada no Commons é a que tem procedência.

As marcas pertencem aos respectivos donos. O uso permitido aqui é nomear o
provedor na interface. Não serve de selo de parceria nem de endosso, e por isso
o logotipo nunca aparece sozinho na tela, sempre ao lado do nome escrito.

| Arquivo | Origem no Commons | Licenca do arquivo |
| --- | --- | --- |
| apple.svg | [Apple logo black.svg](https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg) | Dominio publico |
| discord.svg | [Discord colour textlogo (2021).svg](https://commons.wikimedia.org/wiki/File:Discord_colour_textlogo_(2021).svg) | Dominio publico |
| facebook.svg | [Facebook f logo (2021).svg](https://commons.wikimedia.org/wiki/File:Facebook_f_logo_(2021).svg) | Dominio publico |
| github.svg | [Octicons-mark-github.svg](https://commons.wikimedia.org/wiki/File:Octicons-mark-github.svg) | MIT |
| google.svg | [Google "G" logo.svg](https://commons.wikimedia.org/wiki/File:Google_%22G%22_logo.svg) | Dominio publico |
| instagram.svg | [Instagram logo 2022.svg](https://commons.wikimedia.org/wiki/File:Instagram_logo_2022.svg) | Dominio publico |
| linkedin.svg | [LinkedIn icon.svg](https://commons.wikimedia.org/wiki/File:LinkedIn_icon.svg) | Dominio publico |
| microsoft.svg | [Microsoft - SuperTinyIcons.svg](https://commons.wikimedia.org/wiki/File:Microsoft_-_SuperTinyIcons.svg) | Dominio publico |
| pinterest.svg | [Pinterest Shiny Icon.svg](https://commons.wikimedia.org/wiki/File:Pinterest_Shiny_Icon.svg) | Dominio publico |
| reddit.svg | [Snoo.svg](https://commons.wikimedia.org/wiki/File:Snoo.svg) | Dominio publico |
| telegram.svg | [Telegram logo.svg](https://commons.wikimedia.org/wiki/File:Telegram_logo.svg) | Dominio publico |
| threads.svg | [Threads (app) logo.svg](https://commons.wikimedia.org/wiki/File:Threads_(app)_logo.svg) | Dominio publico |
| tiktok.svg | [Tiktok icon.svg](https://commons.wikimedia.org/wiki/File:Tiktok_icon.svg) | CC0 |
| twitch.svg | [Twitch Glitch Logo Purple.svg](https://commons.wikimedia.org/wiki/File:Twitch_Glitch_Logo_Purple.svg) | Dominio publico |
| whatsapp.svg | [WhatsApp.svg](https://commons.wikimedia.org/wiki/File:WhatsApp.svg) | Dominio publico |
| x.svg | [X icon.svg](https://commons.wikimedia.org/wiki/File:X_icon.svg) | Dominio publico |
| youtube.svg | [YouTube full-color icon (2024).svg](https://commons.wikimedia.org/wiki/File:YouTube_full-color_icon_(2024).svg) | Dominio publico |

## O que falta

Mercado Pago e Mercado Livre não têm arquivo com procedência no Commons. As duas
categorias do cofre aparecem só com o título, o que é o certo: melhor sem marca
do que com uma marca capturada de fonte desconhecida.

## Como manter isto correto

`node scripts/baixar-logos-sociais.mjs` confere cada arquivo contra a página do
Commons e falha se algum divergir; com `--aplicar`, regrava. Vale rodar antes de
mexer nesta pasta: já aconteceu de um arquivo ser trocado por uma versão
monocromática de outra origem sem ninguém perceber, e a tela ficou com metade
das marcas coloridas e metade em preto.

## Tema escuro

`apple`, `github` e `threads` são traço preto sobre fundo transparente e
sumiriam no escuro. O `LogoSocial` marca as três com `logo-social--mono` e o CSS
as inverte sob `[data-theme="dark"]`.

`x` e `tiktok` ficam de fora porque já vêm como emblema fechado, fundo preto com
o símbolo claro recortado: sobre superfície escura o fundo se confunde e sobra o
símbolo claro, que é a versão oficial para tema escuro. Inverter faria dos dois
um disco branco, mais pesado do que o resto da linha.

As coloridas ficam intactas: inverter Instagram ou Google destruiria a cor da
marca, que é metade do reconhecimento.

## Mesmos arquivos no mobile

O app mobile usa o mesmo conjunto, em
`avila-mobile/packages/mobile-ui/assets/social/`, lá também com PNG em 1x, 2x e
3x porque o React Native não renderiza SVG sem `react-native-svg`. Ao trocar uma
logo aqui, troque lá também.
