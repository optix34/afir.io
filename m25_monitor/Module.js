/**
 * M25 Monitor — PILOT Extension
 * Версия с левой панелью (вкладка в skeleton.navigation).
 * Исправлены: загрузка IMEI, оборудования, датчиков, отображение iframe.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    /**
     * Определяет базовый URL расширения (для подгрузки CSS).
     * @return {String}
     */
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

    /**
     * Точка входа, вызывается PILOT.
     */
    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация расширения (с левой панелью)...');

        // Ждём skeleton
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

        // Создаём правую панель (MainPanel)
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            id: 'm25monitor-mainpanel-' + Ext.id()
        });

        // Создаём левую навигацию (Navigation)
        var navPanel = Ext.create('Store.m25_monitor.view.Navigation', {
            title: (typeof l === 'function') ? l('M25 Monitor') : 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit'
        });

        // Связываем панели
        navPanel.setMainPanel(mainPanel);

        // Оборачиваем в LeftBarPanel (требование PILOT)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: (typeof l === 'function') ? l('M25 Monitor') : 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [navPanel]
        });
        // Критическая связь: указываем, какая панель является главной для этой вкладки
        navTab.map_frame = mainPanel;

        // Добавляем вкладку в левую панель
        skeleton.navigation.add(navTab);
        // Добавляем главную панель в правую область
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Вкладка успешно добавлена в левую панель');
    }
});
