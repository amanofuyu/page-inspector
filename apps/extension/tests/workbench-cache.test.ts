// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, shallowRef } from 'vue'
import FeatureWorkbench from '../features/inspector/FeatureWorkbench.vue'

vi.mock('../composables/usePayloadWorker', () => ({
  usePayloadWorker: () => ({ ready: shallowRef(null), pending: ref(0), error: ref(''), stop: vi.fn(), initialize: vi.fn(), call: vi.fn() }),
}))
vi.mock('../composables/useDefinitions', () => ({
  useDefinitions: () => ({ definitions: ref([]), storageNotice: ref(''), save: vi.fn(), remove: vi.fn() }),
}))

describe('工作区缓存', () => {
  it('切换全部工作区后保留插槽、组件实例与滚动位置，再激活时接受最新插槽数据', async () => {
    const revision = ref('快照一')
    const mounts = vi.fn()
    const Page = defineComponent({
      props: { label: String },
      setup(props) {
        mounts()
        const draft = ref('')
        return () => h('div', [
          h('span', props.label),
          h('input', { value: draft.value, onInput: (event: Event) => { draft.value = (event.target as HTMLInputElement).value } }),
        ])
      },
    })
    const wrapper = mount(FeatureWorkbench, {
      props: { active: 'data', status: 'empty' },
      slots: { data: () => h(Page, { label: revision.value }) },
      global: { stubs: { AnalysisView: Page, QueryView: true, WatchView: true, UiActionButton: true } },
    })
    try {
      const dataInput = wrapper.get('input')
      await dataInput.setValue('保留树节点选择')
      const surface = wrapper.get('section').element
      const scroll = vi.spyOn(surface, 'scrollTo')
      await wrapper.setProps({ active: 'analysis' })
      const analysisInput = wrapper.get('input')
      await analysisInput.setValue('保留展开状态')
      surface.scrollTop = 180
      await wrapper.setProps({ active: 'query' })
      await wrapper.setProps({ active: 'watch' })
      await wrapper.setProps({ active: 'seo' })
      revision.value = '快照二'
      await wrapper.setProps({ active: 'data' })
      expect(wrapper.get('input').element).toBe(dataInput.element)
      expect(wrapper.get('input').element.value).toBe('保留树节点选择')
      expect(wrapper.text()).toContain('快照二')
      await wrapper.setProps({ active: 'analysis' })
      expect(wrapper.get('input').element).toBe(analysisInput.element)
      expect(wrapper.get('input').element.value).toBe('保留展开状态')
      expect(scroll).toHaveBeenLastCalledWith({ top: 180, behavior: 'instant' })
      expect(mounts).toHaveBeenCalledTimes(2)
    }
    finally {
      wrapper.unmount()
      vi.restoreAllMocks()
    }
  })
})
