/**
 * M25 Monitor — PILOT Extension
 * Вкладка в левой панели, но без внутреннего дерева.
 * Выбор ТС — через комбобокс в MainPanel.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    getModuleBaseUrl: function() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                return src.substring(0, src.lastIndexOf('/') + 1);
            }
        }
        return location.pathname.replace(/\/[^/]*$/, '/');
    },

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация (вкладка без боковой панели)...');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.defer(me.initModule, 500, me);
            return;
        }

        // Подключаем CSS
        var cssUrl = me.getModuleBaseUrl() + 'view/style.css';
        if (!document.querySelector('link[href="' + cssUrl + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.appendChild(link);
        }

        // Создаём главную панель (она будет содержать комбобокс, iframe и датчики)
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            id: 'm25monitor-mainpanel-' + Ext.id()
        });

        // Оборачиваем в LeftBarPanel (требование PILOT для вкладки)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: (typeof l === 'function') ? l('M25 Monitor') : 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [mainPanel]   // ← только MainPanel, без Navigation
        });
        navTab.map_frame = mainPanel;   // связь

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Вкладка создана, боковой панели нет');
    }
});
