# Langflow Desktop — E2E (Windows)

Testes end-to-end do **IBM Langflow Desktop** com [WebdriverIO](https://webdriver.io), rodando no
**MSI de QA como ele é** — sem plugin, sem build especial, sem mudança no app.

> macOS não é coberto aqui: lá o Tauri só é automatizável com um plugin compilado no app
> (`tauri-plugin-wdio-webdriver`). Linux não tem build do Desktop.

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

## Estrutura

| Caminho | O quê |
|---|---|
| `wdio.conf.ts` | Abre o app com a porta de depuração, sobe o `msedgedriver` (versão do WebView2 instalado) e conecta |
| `test/specs/first-boot.spec.ts` | Primeiro boot: Termos (aceitar/recusar/revisar) → cadastro de e-mail (validações, consentimentos) → instalação → tela principal |
| `scripts/install-langflow-desktop.ps1` | Instala o MSI silenciosamente e imprime o caminho do executável |
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
