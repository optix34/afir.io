/**
 * M25 Monitor - PILOT Extension
 * Точка входа. Создаёт левую вкладку (Navigation) и главную панель (MainPanel),
 * связывает их через map_frame, инициализирует расширение.
 *
 * @class Store.m25_monitor.Module
 * @extends Ext.Component
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    /**
     * Имя расширения (должно совпадать с именем класса и slug в PILOT)
     */
    extensionName: 'm25_monitor',

    /**
     * Точка входа, вызывается PILOT после загрузки Module.js
     */
    initModule: function() {
        var me = this;

        // Проверка обязательных глобальных объектов PILOT
        if (!window.skeleton) {
            Ext.log.error('[M25] skeleton not found');
            return;
        }
        if (!skeleton.navigation) {
            Ext.log.error('[M25] skeleton.navigation not found');
            return;
        }
        if (!skeleton.mapframe) {
            Ext.log.error('[M25] skeleton.mapframe not found');
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

        // 3. Связываем навигацию с главной панелью (обязательное правило PILOT)
        navTab.map_frame = mainPanel;

        // 4. Передаём в Navigation ссылку на MainPanel, чтобы открывать URL при выборе объекта
        var navigation = navTab.items.getAt(0);
        if (navigation && Ext.isFunction(navigation.setMainPanel)) {
            navigation.setMainPanel(mainPanel);
        } else {
            Ext.log.warn('[M25] Navigation component does not have setMainPanel method');
        }

        // 5. Добавляем вкладку в левую навигацию и панель в mapframe
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        // Сохраняем ссылку на mainPanel для возможного внешнего доступа
        me.mainPanel = mainPanel;

        Ext.log('[M25] Extension initialized successfully');
    }
});
