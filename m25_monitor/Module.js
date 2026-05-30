/**
 * M25 Monitor — PILOT Extension
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация расширения');

        // 1. Проверяем готовность системы
        if (!window.skeleton || !skeleton.navigation) {
            Ext.defer(function() { me.initModule(); }, 500, me);
            return;
        }

        // 2. Создаём интерфейс
        me.createInterface();

        // 3. Загружаем данные
        me.loadAllVehicles();

        console.log('[M25] Расширение готово');
    },

    createInterface: function() {
        // Хранилище для данных
        this.vehiclesStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name', 'imei', 'equipment', 'speed', 'fuel', 'ignition'],
            data: []
        });

        // Таблица для отображения
        this.vehiclesGrid = Ext.create('Ext.grid.Panel', {
            store: this.vehiclesStore,
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2 },
                { text: 'UniqID', dataIndex: 'vehid', width: 80 },
                { text: 'Тип', dataIndex: 'equipment', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'IMEI', dataIndex: 'imei', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'Скорость', dataIndex: 'speed', width: 70, renderer: function(v) { return v !== undefined ? v + ' км/ч' : '—'; } },
                { text: 'Топливо', dataIndex: 'fuel', width: 80, renderer: function(v) { return v !== undefined ? v + ' л' : '—'; } },
                { text: 'Зажигание', dataIndex: 'ignition', width: 80, renderer: function(v) { return v === 1 ? 'Вкл' : (v === 0 ? 'Выкл' : '—'); } }
            ],
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [{
                    text: 'Обновить список',
                    iconCls: 'fa fa-sync-alt',
                    handler: function() { this.loadAllVehicles(); },
                    scope: this
                }]
            }]
        });

        // Добавляем панель в левую навигацию
        this.navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [this.vehiclesGrid]
        });
        skeleton.navigation.add(this.navTab);
    },

    loadAllVehicles: function() {
        var me = this;
        if (this.vehiclesGrid) this.vehiclesGrid.setLoading(true);
        
        const API_URL = window.location.origin + '/ax/current_data.php';
        console.log('[M25] Запрос к API:', API_URL);

        // Запрашиваем данные ТС
        Ext.Ajax.request({
            url: API_URL,
            method: 'GET',
            success: function(response) {
                try {
                    // 4. Проверяем код ответа API (критически важно!)
                    const resp = Ext.decode(response.responseText);
                    console.log('[M25] Ответ API:', resp);
                    
                    if (resp.code !== 0) {
                        throw new Error('API вернул ошибку: ' + (resp.msg || 'Неизвестная ошибка'));
                    }
                    
                    // 5. Получаем массив объектов (vehicle list) из ответа
                    let vehicles = [];
                    if (resp.list && Ext.isArray(resp.list)) vehicles = resp.list;
                    else if (resp.objects && Ext.isArray(resp.objects)) vehicles = resp.objects;
                    else if (resp.data && Ext.isArray(resp.data)) vehicles = resp.data;
                    else if (Ext.isArray(resp)) vehicles = resp;
                    
                    if (!vehicles.length) {
                        throw new Error('API не вернул список транспортных средств');
                    }
                    
                    // 6. Формируем данные для таблицы
                    const records = vehicles.map(function(v) {
                        return {
                            vehid: v.vehid || v.id,
                            name: v.name || v.text || 'Без имени',
                            imei: v.imei || '',
                            equipment: v.equipment || v.model || '',
                            speed: v.speed,
                            fuel: v.fuel,
                            ignition: v.ignition
                        };
                    });
                    
                    me.vehiclesStore.loadData(records);
                    console.log('[M25] Загружено ТС:', records.length);
                } catch (e) {
                    console.error('[M25] Ошибка обработки данных:', e);
                    Ext.Msg.alert('Ошибка', e.message);
                }
                me.vehiclesGrid.setLoading(false);
            },
            failure: function(response) {
                console.error('[M25] Ошибка запроса:', response.status);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные. Код: ' + response.status);
                me.vehiclesGrid.setLoading(false);
            }
        });
    }
});
