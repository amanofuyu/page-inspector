import { setupMessage } from './message'

export default defineBackground({
  main() {
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

    setupMessage()

    browser.commands.onCommand.addListener(async (command, tab) => {
      if (command === 'open_sidepanel' && tab?.id) {
        browser.sidePanel.open({ tabId: tab.id })
      }
    })
  },
})
