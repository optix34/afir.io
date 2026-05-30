/**
 * M25 Monitor - PILOT Extension
 * Точка входа. Создаёт левую панель (дерево M25) и правую панель (iframe).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // Подключаем CSS
    cssUrl: Ext.util.Format.format('{0}view/style.css', window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/')),

    initModule: function() {
        var me = this;
        console.log('[M25] Extension initializing...');

        // Защита от отсутствия skeleton
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('[M25] Skeleton not ready, retry in 500ms');
            Ext.defer(me.initModule, 500, me);
            return;
        }

        // Подключаем CSS, если ещё не подключён
        if (!document.querySelector('link[href="' + me.cssUrl + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = me.cssUrl;
            document.head.appendChild(link);
        }

        // Создаём правую панель (MainPanel)
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            id: 'm25monitor-mainpanel-' + Ext.id()
        });

        // Создаём левую навигацию (Navigation)
        var navPanel = Ext.create('Store.m25_monitor.view.Navigation', {
            title: me.getTitle(),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit'
        });

        // Связываем панели
        navPanel.setMainPanel(mainPanel);
        // Сохраняем ссылку для доступа из MainPanel (если потребуется)
        navPanel.mainPanelRef = mainPanel;

        // Добавляем вкладку в левую панель навигации skeleton
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: me.getTitle(),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [navPanel]
        });
        // По соглашению PILOT: map_frame указывает на правую панель
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Extension initialized successfully');
    },

    getTitle: function() {
        return typeof l === 'function' ? l('M25 Monitor') : 'M25 Monitor';
    }
});
