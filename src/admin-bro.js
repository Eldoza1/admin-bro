/* eslint-disable max-len */
const _ = require('lodash')

const Renderer = require('./backend/utils/renderer')
const BaseDecorator = require('./backend/utils/base-decorator')
const BaseResource = require('./backend/adapters/base-resource')
const BaseDatabase = require('./backend/adapters/base-database')
const BaseRecord = require('./backend/adapters/base-record')
const BaseProperty = require('./backend/adapters/base-property')
const PageBuilder = require('./backend/utils/page-builder')
const ValidationError = require('./backend/utils/validation-error')
const ResourcesFactory = require('./backend/utils/resources-factory')
const DefaultDashboard = require('./backend/defaults/default-dashboard')

const Router = require('./backend/router')

const pkg = require('../package.json')

/**
 * @typedef {Object} AdminBroOptions
 *
 * @description AdminBro takes list of options of the entire framework. All off them
 * have default values, but you can tailor them to your needs easily
 *
 * @property {String} [rootPath='/admin']             under which path AdminBro will be available
 * @property {String} [logoutPath='/admin/logout']    url to logout action
 * @property {String} [loginPath='/admin/login']      url to login page
 * @property {BaseDatabase[]} [databases=[]]          array of all databases
 * @property {BaseResource[] | Object[]} [resources=[]] array of all resources. Resources can be
 *                                                    give as in a regular way or nested within
 *                                                    an object along with its options
 * @property {BaseResource} [resources[].resource]    class which extends {@link BaseResource}
 * @property {Object} [resources[].options]           your custom resource settings
 * @property {String} [resources[].options.name]      resource name
 *                                                    when not given decorator will use raw name of the resource
 * @property {Object} [resources[].options.parent]    resource parent along with the icon
 *                                                    By default it is a database type with its icon
 * @property {String} [resources[].options.parent.name] parent name
 * @property {String} [resources[].options.parent.icon] parent icon path
 * @property {Array} [resources[].options.listProperties] list of all properties which will be visible on the list page
 * @property {Array} [resources[].options.editProperties] list of all properties which will be visible on the edit page
 * @property {Array} [resources[].options.showProperties] list of all properties which will be visible on the show page
 * @property {Object} [resources[].options.actions]   object with actions. User can overwrite default actions
 *                                                    or create a new action
 * @property {Object} [branding]                      branding settings
 * @property {PageBuilder} [dashboard]                your custom dashboard page
 * @property {String} [branding.logo]                 logo shown in AdminBro in top left corner
 * @property {String} [branding.companyName]          company name
 * @property {Boolean} [branding.softwareBrothers]    if software brothers logos should be shown
 *                                                    in the sidebar footer
 * @property {Object} [assets]                        assets object
 * @property {String[]}  [assets.styles]              array with a paths to styles
 * @property {String[]}  [assets.scripts]             array with a paths to scripts
 *
 * @example
 * const AdminBro = require('admin-bro')
 *
 * const ArticleModel = require('./article')
 *
 * const connection = await mongoose.connect(process.env.MONGO_URL)
 *
 * const adminBro = new AdminBro({
 *   rootPath: '/xyz-admin',
 *   logoutPath: '/xyz-admin/exit',
 *   loginPath: '/xyz-admin/sign-in',
 *   databases: [connection]
 *   resources: [
 *     {
 *       resource: ArticleModel,
 *       options: {
 *         name: 'Artykuł',
 *         listProperties: ['title', 'content', 'publishedAt'],
 *         showProperties: ['title', 'publishedAt'],
 *         editProperties: ['title', 'publishedAt'],
 *          parent: {
 *            name: 'Knowledge',
 *            icon: 'icon-bomb',
 *         },
 *         properties: {
 *         }
 *         actions: {
 *           edit: {
 *             enable: false,
 *           },
 *           publish: {
 *             id: 'publish',
 *             icon: 'fas fa-share',
 *             label: 'Publish',
 *             enable: ['list', 'show'],
 *             handler: (request, response, view) => {
 *               const { method } = request
 *               if (method === 'GET') {
 *                 return 'Some content or form which you want to place here'
 *               }
 *               return 'PUBLISH ACTION WORKS'
 *             },
 *           },
 *         }
 *       }
 *     }]
 *   branding: {
 *     companyName: 'XYZ c.o.'
 *   },
 *   assets: {
 *     styles: ['/style.css'],
 *     scripts: ['/scripts.js']
 *   }
 * })
 */
const defaults = {
  rootPath: '/admin',
  logoutPath: '/admin/logout',
  loginPath: '/admin/login',
  databases: [],
  resources: [],
  branding: {
    logo: 'https://softwarebrothers.co/assets/images/software-brothers-logo-compact.svg',
    companyName: 'Company Name',
    softwareBrothers: true,
  },
  dashboard: DefaultDashboard,
  assets: {
    styles: ['/style.css'],
    scripts: ['/scripts.js'],
  },
}

/**
 * Main class for Admin extension. It takes {@link AdminBroOptions} as an
 * parameter and creates admin instance.
 *
 * Its main responsibility is to fetch all resources and/or databases given by
 * user. Than its instance is a currier - injected in all other classes.
 *
 */
class AdminBro {
  /**
   * @param  {AdminBroOptions}   options
   */
  constructor(options = {}) {
    /**
     * @type {BaseResource[]}
     * @description List of all resources available for the AdminBro
     */
    this.resources = []

    /**
     * @type {AdminBroOptions}
     * @description Options gave by the user
     */
    this.options = _.merge(defaults, options)

    const { databases, resources } = this.options
    const resourcesFactory = new ResourcesFactory(this, AdminBro.registeredAdapters)
    this.resources = resourcesFactory.buildResources({ databases, resources })
    this.DashboardPage = options.dashboard || defaults.dashboard
  }

  /**
   * Registers various database adapters written for admin-bro
   *
   * @param  {Object}       options
   * @param  {BaseDatabase} options.Database subclass of BaseDatabase
   * @param  {BaseResource} options.Resource subclass of BaseResource
   */
  static registerAdapter({ Database, Resource }) {
    if (!Database || !Resource) {
      throw new Error('Adapter has to have both Database and Resource')
    }
    // checking if both Database and Resource have at least isAdapterFor method
    if (Database.isAdapterFor && Resource.isAdapterFor) {
      AdminBro.registeredAdapters.push({ Database, Resource })
    } else {
      throw new Error('Adapter elements has to be subclassess of AdminBro.BaseResource nad AdminBro.BaseDatabase')
    }
  }

  /**
   * Renders an entire login page with email and password fields
   * using {@link Renderer}.
   *
   * @param  {Object} options
   * @param  {String} options.action          login form action url - it could be
   *                                          '/admin/login'
   * @param  {String} [options.errorMessage]  optional error message. When given
   *                                          renderer will print this message in
   *                                          the form
   * @return {String}                         HTML of the rendered page
   */
  static async renderLogin({ action, errorMessage }) {
    return new Renderer('pages/login', { action, errorMessage }).render()
  }

  /**
   * Returns resource base on its ID
   * @param  {String} resourceId    id of a resource defined under {@link BaseResource#id}
   * @return {BaseResource}         found resource
   */
  findResource(resourceId) {
    return this.resources.find(m => m.id() === resourceId)
  }
}

/**
 * BaseDecorator
 * @type {BaseDecorator}
 */
AdminBro.BaseDecorator = BaseDecorator


/**
 * List of all supported routes along with controllers
 * @type {Router}
 */
AdminBro.Router = Router

/**
 * BaseResource
 * @type {BaseResource}
 */
AdminBro.BaseResource = BaseResource

/**
 * BaseDatabase
 * @type {BaseDatabase}
 */
AdminBro.BaseDatabase = BaseDatabase

/**
 * BaseRecord
 * @type {BaseRecord}
 */
AdminBro.BaseRecord = BaseRecord

/**
 * BaseProperty
 * @type {BaseProperty}
 */
AdminBro.BaseProperty = BaseProperty

/**
 * PageBuilder
 * @type {PageBuilder}
 */
AdminBro.PageBuilder = PageBuilder

/**
 * ValidationError
 * @type {ValidationError}
 */
AdminBro.ValidationError = ValidationError

AdminBro.registeredAdapters = []

AdminBro.VERSION = pkg.version

module.exports = AdminBro
