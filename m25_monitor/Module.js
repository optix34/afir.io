/**
 * M25 Monitor — PILOT Extension
 * Создаёт вкладку в левой навигации, внутри которой находится MainPanel.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function () {
        var me = this;

        // Ожидаем готовность skeleton
        if (!window.skeleton || !skeleton.navigation) {
            Ext.defer(me.initModule, 500, me);
            return;
        }

        // Подключаем CSS (используем proxied путь, рекомендованный PILOT)
        var cssUrl = '/store/m25_monitor/view/style.css';
        if (!document.querySelector('link[href="' + cssUrl + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.appendChild(link);
        }

        // Создаём главную панель (с комбобоксом, датчиками и iframe)
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            id: 'm25monitor-mainpanel-' + Ext.id()
        });

        // Оборачиваем в LeftBarPanel для размещения в левой навигации
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [mainPanel]
        });
        // Обязательная связь: указываем, какая панель является главной для этой вкладки
        navTab.map_frame = mainPanel;

        // Добавляем вкладку в левую панель
        skeleton.navigation.add(navTab);

        // Добавляем панель в центральную область (mapframe или map_frame)
        if (skeleton.mapframe) {
            skeleton.mapframe.add(mainPanel);
        } else if (skeleton.map_frame) {
            skeleton.map_frame.add(mainPanel);
        }

        console.log('[M25] Расширение успешно загружено (вкладка создана)');
    }
});
