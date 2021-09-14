const store = {
  douyu: {
    ywwuyiLiveOnline: false,
    ywwuyiLiveCategory: null as null | string,
  },
  bili: {} as Record<
    string,
    {
      wasOnline: boolean
      lastCategory: null | string
      lastTitle: null | string
      lastOnline: Date | null
    }
  >,
}

export default store
