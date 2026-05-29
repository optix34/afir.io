/**
 * M25 Monitor - PILOT Extension
 * Точка входа. Создаёт левую вкладку и главную панель, связывает их.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Проверка обязательных глобальных объектов
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('[M25] skeleton, navigation or mapframe not found');
            return;
        }

        // 1. Создаём левую навигационную панель (вкладку)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('M25 Monitor'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [
                Ext.create('Store.m25_monitor.view.Navigation', {})
            ]
        });

        // 2. Создаём главную панель (правую область с iframe)
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {});

        // 3. Связываем навигацию с главной панелью (обязательное правило)
        navTab.map_frame = mainPanel;

        // 4. Передаём в Navigation ссылку на MainPanel (чтобы открывать URL)
        var navigation = navTab.items.getAt(0);
        if (navigation && navigation.setMainPanel) {
            navigation.setMainPanel(mainPanel);
        }

        // 5. Добавляем вкладку и панель в интерфейс PILOT
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Extension initialized');
    }
});
