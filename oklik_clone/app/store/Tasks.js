Ext.define('Store.oklik_clone.store.Tasks', {
    extend: 'Ext.data.Store',
    model: 'Store.oklik_clone.model.Task',
    autoLoad: true,
    pageSize: 25,
    remoteSort: true,
    remoteFilter: true
});
