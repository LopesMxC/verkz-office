# Antivírus acusando o VERKZ Office

## Por que acontece
O instalador e o .exe não têm **assinatura digital** (certificado de código). Para o Windows Defender,
SmartScreen e outros antivírus, um programa novo, sem assinatura e baixado por poucas pessoas é
"desconhecido", e a análise automática (machine learning) às vezes marca como suspeito
(nomes comuns: `Wacatac`, `Trojan:Win32/...!ml`, "Reputação desconhecida"). Não é vírus de verdade.

## O que já foi feito no app (v0.6.0)
- Tirado o argumento que **desligava o SmartScreen** dentro do WebView (`msSmartScreenProtection`):
  desligar proteção do sistema é um dos sinais que mais pesam contra o programa.
- Instalador com o **WebView2 embutido** (embedBootstrapper) em vez de baixar e executar um .exe da
  internet durante a instalação (outro padrão que os antivírus olham).
- Dados de editor no .exe e no instalador: publisher "VERKZ", copyright, site e descrição.
- Instalação só para o usuário (sem pedir administrador).

## O que resolve de vez (precisa ser feito pela VERKZ)
1. **Assinar o app no Windows.** Opções:
   - **Azure Trusted Signing** (Microsoft, ~US$ 10/mês): o mais barato e o que o Windows mais confia.
     Precisa de CNPJ com 3+ anos ou validação da empresa.
   - Certificado OV de uma autoridade (Sectigo, Certum, DigiCert): ~R$ 600 a R$ 2.000/ano.
   Com o certificado, dá para assinar no `compilador.bat` (o Tauri aceita `bundle.windows.signCommand`
   ou `certificateThumbprint` no `tauri.conf.json`).
2. **Enviar o instalador para a Microsoft analisar** (grátis, leva de 1 a 3 dias):
   https://www.microsoft.com/en-us/wdsi/filesubmission → "Software developer" → envie o
   `VERKZ Office_0.6.0_x64-setup.exe` e marque "Incorrectly detected as malware".
   Repita a cada versão nova até a reputação firmar.
3. Se for outro antivírus (Avast, AVG, Kaspersky, Norton...), cada um tem página de "falso positivo"
   para envio do arquivo.
4. **Mac:** assinatura + notarização exigem conta Apple Developer (US$ 99/ano).

Enquanto isso, na máquina de cada um: Segurança do Windows > Proteção contra vírus e ameaças >
Histórico de proteção > Permitir no dispositivo (ou adicionar a pasta do app às exclusões).
