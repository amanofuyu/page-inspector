import { setupMessage } from './message'

export default defineBackground({
  main() {
    setupMessage()
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)
    browser.commands.onCommand.addListener((command, tab) => {
      if (command === 'open_sidepanel' && tab?.id !== undefined)
        void browser.sidePanel.open({ tabId: tab.id }).catch(console.error)
    })
  },
})
