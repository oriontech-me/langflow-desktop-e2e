# Langflow Desktop — E2E (Windows e macOS)

Testes end-to-end do **IBM Langflow Desktop** com [WebdriverIO](https://webdriver.io). As mesmas specs rodam nos dois sistemas:

- **Windows**: no **MSI de QA como ele é** — sem plugin, sem build especial, sem mudança no app. Roda no CI (GitHub Actions).
- **macOS**: num DMG de QA com o servidor WebDriver embutido (`enable_webdriver`). Por enquanto, só local — veja [macOS](#macos).

> Linux não tem build do Desktop.

## Como funciona

O Langflow Desktop é um app **Tauri**: a interface roda num **WebView2** (o motor do Edge) dentro do app.
O WebdriverIO controla essa interface pelo `msedgedriver`:

1. Abrimos o app com a porta de depuração do WebView2 ligada (`--remote-debugging-port=9222`).
2. O `msedgedriver` se **conecta** ao webview já aberto (`ms:edgeOptions.debuggerAddress`), usando WebDriver Classic.
3. Antes das specs, o WebdriverIO seleciona a janela que mostra a UI do Langflow.

Tudo isso está no `onPrepare`/`before` do `wdio.conf.ts`; as specs só usam `$('[data-testid="..."]')`.

**Por que não `tauri-driver`/`@wdio/tauri-service`?** Eles pedem a porta de depuração pela variável
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, e o WebView2 **ignora variáveis `WEBVIEW2_*` quando o app roda como
administrador** ([docs da Microsoft](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags)).
Os runners Windows do GitHub rodam tudo como administrador. A política `HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`
é respeitada mesmo assim — o workflow a grava antes dos testes.

```
langflow-ai/langflow-desktop          este repo (GitHub Actions, windows-latest)
  workflow "Build Unsigned"   ──MSI──▶  baixa artefato langflow-windows-msi
  (pr-build.yml)                        instala com msiexec /qn
                                        grava a política HKLM da porta de depuração
                                        WebdriverIO abre "Langflow .exe", conecta o msedgedriver e roda as specs
                                        publica test-results/ como artefato
```

## Rodar no CI (sem máquina ligada)

1. Crie um **fine-grained PAT** com *Resource owner* `langflow-ai`, só o repositório `langflow-desktop`,
   permissão **Actions: Read-only**. Um admin da org `langflow-ai` precisa aprovar.
2. Salve como secret **`LANGFLOW_DESKTOP_TOKEN`** neste repositório (Settings → Secrets → Actions).
3. Rode o workflow **Langflow Desktop E2E (Windows)** em *Actions → Run workflow*:
   - `desktop_branch`: branch do Desktop cujo último build com sucesso será testado (padrão `release-1.13.0`);
   - `desktop_run_id`: opcional, para testar um build específico.
   Por enquanto só roda manualmente: no plano free os minutos de Windows contam em dobro. O agendamento
   (seg–sex 06:00 BRT) está comentado no workflow para ligar quando a suíte estiver estável.
4. Resultado: aba *Summary* do run + artefato `desktop-e2e-windows-<id>` com logs do WebdriverIO,
   screenshots de falhas, log do instalador e logs do app.

Os artefatos MSI do Desktop expiram em **7 dias** — o workflow precisa de um "Build Unsigned" recente na branch.
Um run completo leva ~15 min (o primeiro boot instala Python + Langflow: ~7 min).

## Rodar no seu PC Windows (para escrever/depurar testes)

⚠️ O app usa a porta fixa **7860** e guarda os dados em `%LOCALAPPDATA%\com.LangflowDesktop` e
`%APPDATA%\com.LangflowDesktop`. Os testes mexem nos mesmos dados de um Langflow Desktop que você use no dia a dia,
e o fluxo de "primeiro boot" só aparece numa máquina limpa (sem essas pastas).

Pré-requisitos: Node 20+ e o WebView2 Runtime (já vem no Windows 11). Rode num terminal **normal** (não como
administrador) — assim a variável de ambiente basta e não é preciso mexer no registro.

```powershell
npm ci

# instala um MSI baixado do workflow "Build Unsigned" e descobre o caminho do .exe
$env:LANGFLOW_DESKTOP_EXE = ./scripts/install-langflow-desktop.ps1 -MsiPath C:\caminho\Langflow_1.13.0_x64_en-US.msi
# ou, se já está instalado:
# $env:LANGFLOW_DESKTOP_EXE = "C:\Program Files\Langflow\Langflow .exe"

npm test          # tudo
npm run test:smoke
```

Feche o Langflow Desktop antes de rodar: o WebdriverIO abre a própria instância.

## macOS

No Mac o WebView (WKWebView) não tem porta de depuração, então o app precisa trazer o próprio servidor WebDriver:
o plugin `tauri-plugin-wdio-webdriver`, que o `langflow-desktop` compila só quando o workflow **"Build Unsigned"**
é disparado com **`enable_webdriver` = true** (feature `webdriver`; nunca entra em build de produção).
O app abre o servidor em `127.0.0.1:4445` e o WebdriverIO conversa direto com ele — sem `msedgedriver`.

```bash
# 1. uma vez por build: baixa o DMG de um "Build Unsigned" com enable_webdriver e extrai o app para .cache/app
gh run download <RUN_ID> -R langflow-ai/langflow-desktop -n langflow-macos-arm-dmg -D .cache/dmg
scripts/install-langflow-desktop-macos.sh .cache/dmg/*.dmg

# 2. antes de cada execução: volta ao "primeiro boot" (APAGA os dados do Desktop desta máquina)
scripts/reset-langflow-desktop-macos.sh

# 3. roda
npm run test:mac
npx wdio run ./wdio.mac.conf.ts --mochaOpts.grep "(Terms agreement|Email registration)"   # só Termos + cadastro
```

⚠️ No macOS o Desktop guarda tudo em **`~/.langflow`** (venv, uv, `data/database.db`) além de `~/Library/*/com.LangflowDesktop`
— o reset apaga esses caminhos. Pastas `~/Library/*/langflow` (sem `com.`) são de um Langflow de dev e ficam intactas.
A porta **7860** precisa estar livre (pare um Langflow de dev antes); o run aborta se estiver ocupada.

Diferenças que importam ao escrever testes:

- Menus e botões de modal do Langflow (Radix) **não reagem ao clique** do WebDriver no WKWebView — o elemento só ganha
  foco. Ative pelo teclado: foco + `browser.keys('Enter')`. Funciona igual no Windows.
- O executável do bundle é `Langflow .app/Contents/MacOS/Langflow ` (com espaço no fim); o `wdio.mac.conf.ts` lê o nome do `Info.plist`.
- Downloads (exportar flow etc.) abrem a janela **nativa** de "Salvar como", invisível ao WebDriver, nos dois sistemas.
  Ainda não há como testá-los ponta a ponta.

## Estrutura

| Caminho | O quê |
|---|---|
| `wdio.conf.ts` | Windows: abre o app com a porta de depuração, sobe o `msedgedriver` (versão do WebView2 instalado) e conecta |
| `wdio.mac.conf.ts` | macOS: abre o app com o servidor WebDriver embutido e conecta nele |
| `test/specs/first-boot.spec.ts` | Primeiro boot: Termos (aceitar/recusar/revisar) → cadastro de e-mail (validações, consentimentos) → instalação → tela principal |
| `scripts/install-langflow-desktop.ps1` | Windows: instala o MSI silenciosamente e imprime o caminho do executável |
| `scripts/install-langflow-desktop-macos.sh` | macOS: extrai o `.app` do DMG para `.cache/app` (não mexe em `/Applications`) |
| `scripts/reset-langflow-desktop-macos.sh` | macOS: apaga os dados do Desktop para o próximo boot ser um primeiro boot |
| `.github/workflows/e2e-windows.yml` | Pipeline do CI |

## Escrevendo testes

- Use os `data-testid` do frontend (`langflow-ai/langflow-desktop`, `src/frontend/src/`). As telas próprias do Desktop
  ficam em `src/frontend/src/customization/`; o resto é o frontend do Langflow OSS, os mesmos ids usados no `langflow-e2e`.
- Seletores CSS normais funcionam: `$('[data-testid="..."]')`. Para texto sem `data-testid`, XPath:
  `$('//*[normalize-space(text())="Texto"]')`.
- Todas as specs compartilham **uma** instância do app, aberta no `onPrepare`, e rodam em sequência
  (`maxInstances: 1`, porta fixa). O estado de uma spec é o ponto de partida da próxima.
- O runner roda na mesma máquina do app: dá para chamar a API do backend direto de Node (`fetch('http://localhost:7860/...')`)
  para preparar massa ou verificar estado.
